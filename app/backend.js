// Back office for the voice agent: projects, team, customers, auto-assignment, WhatsApp follow-ups,
// per-project assignment sheets and CRM push. Everything is stored in this browser (localStorage).

// ---------- Shared helpers (also used by the call console in index.html) ----------
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mem = {}; // fallback when browser storage is blocked
const store = window.estateStore || {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return mem[k] ?? null; } },
  set(k,v){ mem[k] = v; try{ localStorage.setItem(k,v); }catch(e){} },
  del(k){ delete mem[k]; try{ localStorage.removeItem(k); }catch(e){} },
};
const LANGS = [
  ['en-IN','English (India)'], ['ml-IN','Malayalam · മലയാളം'], ['hi-IN','Hindi · हिन्दी'],
  ['mr-IN','Marathi · मराठी'], ['gu-IN','Gujarati · ગુજરાતી'], ['ta-IN','Tamil · தமிழ்'],
  ['te-IN','Telugu · తెలుగు'], ['kn-IN','Kannada · ಕನ್ನಡ'], ['bn-IN','Bengali · বাংলা'],
  ['pa-IN','Punjabi · ਪੰਜਾਬੀ'], ['or-IN','Odia · ଓଡ଼ିଆ'], ['as-IN','Assamese · অসমীয়া'],
  ['ur-IN','Urdu · اردو'],
];
const LANG_CODES = LANGS.map(l => l[0]);
const langName = code => (LANGS.find(l => l[0] === code) || [,''])[1];
const langShort = code => (langName(code).split(' · ')[0] || code);
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nowIso = () => new Date().toISOString();
const digits = s => String(s || '').replace(/\D/g, '');
const isDummyNumber = s => /^91?55555/.test(digits(s));
function normPhone(raw){
  const d = digits(raw);
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  if (/^[6-9]\d{9}$/.test(ten)) return '+91 ' + ten.slice(0,5) + ' ' + ten.slice(5);
  if (/^\+/.test(String(raw).trim()) && d.length >= 8 && d.length <= 15) return '+' + d;
  return null;
}
const samePhone = (a, b) => digits(a).slice(-10) === digits(b).slice(-10) && digits(a).length >= 10;

// ---------- Formatting ----------
function fmtLakh(v){
  v = +v; if (!v) return '';
  return v >= 100 ? `${+(v / 100).toFixed(2)} crore` : `${+v.toFixed(2)} lakh`;
}
const fmtRupees = n => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' }) : '';
const weekday = d => d.toLocaleDateString('en-US', { weekday:'short' });
function fmtWhen(d){
  const now = new Date(), day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - day0) / 864e5);
  const time = d.toLocaleTimeString('en-IN', { hour:'numeric', minute:'2-digit', hour12:true });
  if (diff === 0) return `today at ${time}`;
  if (diff === 1) return `tomorrow at ${time}`;
  return `on ${d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })} at ${time}`;
}
function emi(principal, ratePct, years){
  const r = ratePct / 1200, n = years * 12;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

// ---------- Database ----------
const ROLE_LABEL = { sales:'Relationship manager', sales_manager:'Sales manager', management:'Management', admin:'Administrator', site_manager:'Site manager', site_engineer:'Site engineer', crm:'CRM executive', other:'Other' };
const STAGES = ['New','Contacted','Site visit booked','Visited','Negotiation','Booked','Lost','Opted out'];
const CLOSED_STAGES = ['Booked','Lost','Opted out'];
const DEFAULT_TEMPLATES = {
  welcome: `Hi {customer}, thank you for your time on the call about {project}, {location} 🏡

📎 {brochure_line}

Your relationship manager: {rep}, {rep_phone}. {rep_first} will call you {time}.{visit_line}

Any questions? Call us on {inbound_number}.`,
  rep_change: `Hi {customer}, an update on your {project} enquiry: your relationship manager is now {rep}, {rep_phone}. {rep_first} will call you {time}. Sorry for any inconvenience!`,
  rep_alert: `🔔 Lead {alert_kind}: {customer}, {customer_phone}
{project} · {requirement} · Budget {budget}
Score {score} ({status}). Please call {time}.{visit_line}{personal_line}`,
  drip1: `Hi {customer}, today's availability at {project}:
{availability}
Want floor plans for a particular home? Just reply here.`,
  drip2: `Planning your home loan? {project} has tie-ups with {banks}.
{emi_example}
{rep_first} can help with the paperwork: {rep_phone}`,
  drip3: `{offers}
Site visits: {site_hours}
Shall {rep_first} book a slot for you this weekend? Reply YES.`,
};
const TEMPLATE_LABEL = { welcome:'Right after the call: brochure + relationship manager', rep_change:'When the relationship manager changes',
  rep_alert:'To the sales rep when a lead is assigned', drip1:'Follow-up 1: availability', drip2:'Follow-up 2: home loans', drip3:'Follow-up 3: offer + site visit' };
const DEFAULT_CRM_TEMPLATE_V1 = `{
  "name": "{customer}",
  "mobile": "{mobile_10}",
  "country_code": "91",
  "whatsapp": "{whatsapp}",
  "project": "{project}",
  "source": "AI Voice Agent",
  "sub_source": "{source}",
  "assigned_to": "{rep}",
  "assigned_to_mobile": "{rep_phone}",
  "requirement": "{requirement}",
  "budget": "{budget}",
  "stage": "{stage}",
  "site_visit": "{site_visit}",
  "follow_up": "{follow_up}",
  "remarks": "Affinity score {score} ({status}). {summary}"
}`;
const DEFAULT_CRM_TEMPLATE = `{
  "name": "{customer}",
  "mobile": "{mobile_10}",
  "country_code": "91",
  "whatsapp": "{whatsapp}",
  "project": "{project}",
  "source": "AI Voice Agent",
  "sub_source": "{source}",
  "assigned_to": "{rep}",
  "assigned_to_mobile": "{rep_phone}",
  "requirement": "{requirement}",
  "budget": "{budget}",
  "stage": "{stage}",
  "site_visit": "{site_visit}",
  "follow_up": "{follow_up}",
  "personal_notes": "{personal}",
  "remarks": "Affinity score {score} ({status}). {summary} Personal: {personal}"
}`;
function defaultSettings(){
  return {
    whatsapp: { mode:'simulate', apiVersion:'v21.0', phoneNumberId:'', token:'', templateLang:'en',
      metaTemplates:{ welcome:'', rep_change:'', rep_alert:'', drip1:'', drip2:'', drip3:'' },
      webhookUrl:'', webhookHeader:'Authorization', webhookKey:'', demoSpeed:true, notifyReps:true, dripOn:true },
    templates: { ...DEFAULT_TEMPLATES },
    drip: [ { day:1, template:'drip1' }, { day:3, template:'drip2' }, { day:6, template:'drip3' } ],
    crm: { url:'', method:'POST', authHeader:'api-key', authPrefix:'', apiKey:'', autoPush:false, template: DEFAULT_CRM_TEMPLATE },
    twilio: { line:'local', sid:'', token:'', from:'', publicUrl:'', numberSid:'', numbers:[], fillers:true },
  };
}
function freshDb(){
  const seed = JSON.parse(JSON.stringify(SEED)), now = nowIso();
  seed.projects.forEach(p => p.updatedAt = now);
  return { version:1, company: seed.company, projects: seed.projects, team: seed.team, customers: [], messages: [], settings: defaultSettings() };
}
let db;
function loadDb(){
  try { db = JSON.parse(store.get('lq.db') || 'null'); } catch(e){ db = null; }
  if (!db || !Array.isArray(db.projects)) db = freshDb();
  const d = defaultSettings(); // fill in settings added in later versions
  db.settings = { ...d, ...db.settings, whatsapp:{ ...d.whatsapp, ...(db.settings||{}).whatsapp }, crm:{ ...d.crm, ...(db.settings||{}).crm },
    twilio:{ ...d.twilio, ...(db.settings||{}).twilio },
    templates:{ ...d.templates, ...(db.settings||{}).templates } };
  db.customers ||= []; db.messages ||= [];
  // Upgrades for data saved by earlier versions
  db.projects.forEach(p => { if (p.nearby === undefined){ p.nearby = (SEED.projects.find(s => s.id === p.id) || {}).nearby || ''; } });
  const oldAlert = `🔔 Lead {alert_kind}: {customer}, {customer_phone}
{project} · {requirement} · Budget {budget}
Score {score} ({status}). Please call {time}.{visit_line}`;
  if (db.settings.templates.rep_alert === oldAlert) db.settings.templates.rep_alert = DEFAULT_TEMPLATES.rep_alert;
  if (!/personal/.test(db.settings.crm.template) && db.settings.crm.template === DEFAULT_CRM_TEMPLATE_V1) db.settings.crm.template = DEFAULT_CRM_TEMPLATE;
}
function saveDb(){ store.set('lq.db', JSON.stringify(db)); }
loadDb();

const project = id => db.projects.find(p => p.id === id);
const member = id => db.team.find(m => m.id === id);
const siteManager = p => db.team.find(m => m.role === 'site_manager' && m.projects.includes(p.id));
const activeLoad = repId => db.customers.filter(c => c.repId === repId && !CLOSED_STAGES.includes(c.stage)).length;
const findCustomer = (phone, projectId, simulated) => db.customers.find(c => c.projectId === projectId && samePhone(c.phone, phone) && (simulated === undefined || !!c.simulated === simulated));
const cheapestAvailable = p => p.inventory.filter(u => +u.available > 0).sort((a,b) => a.priceFrom - b.priceFrom)[0];

// ---------- What the agent knows about a project (rebuilt on every reply, so edits apply at once) ----------
// Compact on purpose: it is sent to the AI on every turn, and the free Groq tier counts every token.
function projectKB(p){
  const best = p.loans.length ? p.loans.reduce((a, b) => +a.rate <= +b.rate ? a : b) : null;
  const inv = p.inventory.map(u => {
    const left = +u.available, tag = left <= 0 ? 'SOLD OUT' : left <= 10 ? `only ${left} left` : `${left} left`;
    const emiTxt = best && left > 0 ? `; EMI from about ${fmtRupees(emi(u.priceFrom * 1e5 * 0.8, +best.rate, 20))}/month` : '';
    return `- ${u.config}, ${u.carpet} sq ft carpet: ${fmtLakh(u.priceFrom)} to ${fmtLakh(u.priceTo)}, ${tag}${emiTxt}${u.note ? '. ' + u.note : ''}`;
  }).join('\n');
  const loans = p.loans.map(l => `${l.bank} ${l.rate}% (up to ${l.ltv}%, ${l.tenure} yrs${l.note ? ', ' + l.note : ''})`).join('; ');
  const team = db.team.filter(m => m.role !== 'sales' && m.projects.includes(p.id)).map(m => `${ROLE_LABEL[m.role]} ${m.name} ${m.phone}`).join('; ');
  return [
    `${p.name} by ${p.developer}, ${p.location} (${p.address}). ${p.status}. Possession: ${p.possession}. RERA ${p.rera}. ${p.landArea || ''} Enquiry line ${p.inboundNumber}.`,
    `Homes (all-inclusive prices, availability as of ${fmtDateTime(p.updatedAt)}):\n${inv}`,
    best ? `EMIs above: 80% loan at ${best.rate}% for 20 years. Loan partners: ${loans}.` : '',
    `Payment plan: ${p.paymentPlan} Price includes / charges: ${p.charges}`,
    p.offers ? `Offer: ${p.offers}` : 'No offer running now.',
    `Amenities: ${p.amenities} Connectivity: ${p.connectivity}`,
    `Site visits: ${p.siteVisit}${team ? ' Site team: ' + team + '.' : ''}`,
    p.nearby ? `Nearby places (distance, usual travel time from the project):\n${p.nearby}` : '',
    p.faqs ? `FAQs:\n${p.faqs}` : '',
  ].filter(Boolean).join('\n');
}

// ---------- Follow-up time: the next free half-hour in the rep's shift, at least 2 hours out ----------
function nextSlot(rep, from = new Date()){
  const [sh, sm] = (rep?.shiftStart || '10:00').split(':').map(Number), [eh, em] = (rep?.shiftEnd || '19:00').split(':').map(Number);
  const start = sh * 60 + sm, end = eh * 60 + em - 30;
  let t = new Date(from.getTime() + 2 * 3600e3); t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() <= 30 ? 30 : 60);
  for (let i = 0; i < 14; i++){
    const mins = t.getHours() * 60 + t.getMinutes();
    if (weekday(t) !== rep?.weeklyOff && mins >= start && mins <= end) return t;
    if (mins < start && weekday(t) !== rep?.weeklyOff){ t.setHours(sh, sm + 30, 0, 0); continue; }
    t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, sh, sm + 30);
  }
  return t;
}
function setFollowUp(c){
  const rep = member(c.repId);
  if (c.callback){ c.followUpAt = ''; c.followUpText = `at the time you asked (${c.callback})`; return; }
  const t = nextSlot(rep);
  c.followUpAt = t.toISOString(); c.followUpText = fmtWhen(t);
}

// ---------- Auto-assignment ----------
function pickRep(c, exclude = []){
  let pool = db.team.filter(m => m.role === 'sales' && m.available && !exclude.includes(m.id) && m.projects.includes(c.projectId)), other = false;
  if (!pool.length){ pool = db.team.filter(m => m.role === 'sales' && m.available && !exclude.includes(m.id)); other = true; }
  if (!pool.length) return null;
  const today = weekday(new Date());
  const ranked = pool.map(m => ({ m, off: m.weeklyOff === today ? 1 : 0, lang: m.languages.includes(c.language) ? 0 : 1, load: activeLoad(m.id), last: m.lastAssignedAt || '' }))
    .sort((a, b) => a.off - b.off || a.lang - b.lang || a.load - b.load || a.last.localeCompare(b.last));
  const b = ranked[0];
  const reason = [b.lang === 0 && c.language ? `speaks ${langShort(c.language)}` : null, `${b.load} active lead${b.load === 1 ? '' : 's'}`,
    b.off ? 'weekly off today, nobody else free' : null, other ? 'from another project, nobody free on this one' : null].filter(Boolean).join(', ');
  return { rep: b.m, reason };
}
function assignRep(c, rep, by, reason){
  const old = c.repId && c.repId !== rep.id ? member(c.repId) : null;
  c.repId = rep.id; c.assignedBy = by; c.assignReason = reason; c.assignedAt = nowIso(); rep.lastAssignedAt = c.assignedAt;
  setFollowUp(c);
  log(c, `${old ? `Reassigned from ${old.name} to` : 'Assigned to'} ${rep.name} (${by}: ${reason})`);
  if (old) queueCustomerMsg(c, 'rep_change', { old_rep: old.name });
  queueRepAlert(c, rep, old ? 'reassigned to you' : 'assigned to you');
  return rep;
}
function autoAssign(c, exclude = []){
  const pick = pickRep(c, exclude);
  if (!pick){ log(c, 'No sales rep available: left unassigned'); return null; }
  return assignRep(c, pick.rep, 'auto', pick.reason);
}
// A rep marked absent: move their open customers to whoever is free
function setAvailability(m, available){
  m.available = available;
  if (!available && m.role === 'sales'){
    const open = db.customers.filter(c => c.repId === m.id && !CLOSED_STAGES.includes(c.stage));
    if (open.length && confirm(`${m.name} has ${open.length} open customer${open.length > 1 ? 's' : ''}. Reassign them automatically now? Each customer gets a WhatsApp with their new relationship manager.`)){
      open.forEach(c => { const pick = pickRep(c, [m.id]); if (pick) assignRep(c, pick.rep, 'auto', `${m.name} unavailable; ${pick.reason}`); });
      toast(`Reassigned ${open.length} customer${open.length > 1 ? 's' : ''} from ${m.name}`);
    }
  }
  saveDb(); tickOutbox(); renderAll();
}
function log(c, text){ (c.history ||= []).push({ at: nowIso(), text }); c.updatedAt = nowIso(); }

// ---------- WhatsApp: queue, fill at send time, send ----------
function msgVars(c, extra = {}){
  const p = project(c.projectId) || {}, r = member(c.repId), site = siteManager(p), cheap = cheapestAvailable(p);
  const best = (p.loans || []).length ? p.loans.reduce((a, b) => +a.rate <= +b.rate ? a : b) : null;
  const httpBrochure = /^https?:/i.test(p.brochureUrl || '');
  return {
    customer: (c.name || '').split(' ')[0] || 'there', customer_full: c.name || '', customer_phone: c.phone,
    project: p.name, location: p.location, inbound_number: p.inboundNumber,
    rep: r ? r.name : 'our sales team', rep_first: r ? r.name.split(' ')[0] : 'Our team', rep_phone: r ? r.phone : p.inboundNumber,
    time: c.followUpText || 'shortly',
    brochure_line: p.brochureName ? `${p.name} brochure attached${httpBrochure ? '' : ' (local copy)'}.` : `Our team will share the ${p.name} brochure shortly.`,
    visit_line: c.siteVisit ? `\nSite visit: ${c.siteVisit}.${site ? ` ${site.name} (${site.phone}) will receive you at the site.` : ''}` : '',
    requirement: c.requirement || 'requirement not captured', budget: c.budget || 'not shared', score: c.score ?? '–', status: c.statusLabel || c.status || '',
    availability: (p.inventory || []).filter(u => +u.available > 0).map(u => `• ${u.config}: from ${fmtLakh(u.priceFrom)}, ${u.available} left`).join('\n'),
    banks: (p.loans || []).map(l => l.bank).join(', '),
    emi_example: cheap && best ? `Example: a ${cheap.config} from ${fmtLakh(cheap.priceFrom)} with an 80% loan at ${best.rate}% for 20 years is about ${fmtRupees(emi(cheap.priceFrom * 1e5 * 0.8, +best.rate, 20))} a month.` : '',
    offers: p.offers || `Come and see ${p.name} in person.`, site_hours: p.siteVisit, site_visit: c.siteVisit || '',
    alert_kind: 'assigned to you', old_rep: '',
    personal: c.personal || '', personal_line: c.personal ? `\nPersonal: ${c.personal}` : '',
    ...extra,
  };
}
const fillTemplate = (t, vars) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
function renderMessage(m){
  if (m.text) return m.text; // already sent: frozen
  const c = db.customers.find(x => x.id === m.customerId);
  return c ? fillTemplate(db.settings.templates[m.template], msgVars(c, m.extra)) : '';
}
function queueCustomerMsg(c, template, extra = {}, delayMs = 0){
  if (c.waStatus === 'declined' || c.stage === 'Opted out') return null;
  const p = project(c.projectId);
  const m = { id: uid(), simulated:!!c.simulated, customerId: c.id, projectId: c.projectId, audience:'customer', to: c.whatsapp || c.phone, toName: c.name || c.phone,
    template, extra, attachment: template === 'welcome' && p?.brochureName ? { name: p.brochureName, url: p.brochureUrl } : null,
    status: c.waStatus === 'confirmed' ? 'scheduled' : 'awaiting_confirmation', sendAfter: new Date(Date.now() + delayMs).toISOString(), createdAt: nowIso() };
  db.messages.push(m); return m;
}
function queueRepAlert(c, rep, kind){
  if (!db.settings.whatsapp.notifyReps || !rep) return;
  db.messages.push({ id: uid(), simulated:!!c.simulated, customerId: c.id, projectId: c.projectId, audience:'rep', to: rep.phone, toName: rep.name, template:'rep_alert',
    extra:{ alert_kind: kind }, attachment:null, status:'scheduled', sendAfter: nowIso(), createdAt: nowIso() });
}
function scheduleFollowUps(c){
  queueCustomerMsg(c, 'welcome');
  if (!db.settings.whatsapp.dripOn) return;
  const dayMs = c.simulated && db.settings.whatsapp.demoSpeed ? 60e3 : 864e5;
  db.settings.drip.forEach(d => queueCustomerMsg(c, d.template, {}, d.day * dayMs));
  c.welcomeQueued = true;
}
function cancelPending(c, why){
  db.messages.filter(m => m.customerId === c.id && ['scheduled','awaiting_confirmation'].includes(m.status) && m.audience === 'customer')
    .forEach(m => { m.status = 'cancelled'; m.error = why; });
}
function confirmWhatsApp(c, number){
  c.whatsapp = number || c.whatsapp || c.phone; c.waStatus = 'confirmed';
  db.messages.filter(m => m.customerId === c.id && m.status === 'awaiting_confirmation').forEach(m => {
    m.status = 'scheduled'; m.to = c.whatsapp; if (new Date(m.sendAfter) < new Date()) m.sendAfter = nowIso();
  });
  log(c, 'WhatsApp number confirmed: ' + c.whatsapp);
  saveDb(); tickOutbox(); renderAll();
}

let ticking = false;
async function tickOutbox(){
  if (ticking) return; ticking = true;
  try {
    const due = db.messages.filter(m => m.status === 'scheduled' && new Date(m.sendAfter) <= new Date());
    for (const m of due){
      const c = db.customers.find(x => x.id === m.customerId);
      if (m.audience === 'customer' && c && CLOSED_STAGES.includes(c.stage) && m.template !== 'rep_change'){ m.status = 'cancelled'; m.error = 'Customer stage: ' + c.stage; continue; }
      await sendMessage(m);
    }
  } finally { ticking = false; saveDb(); renderOutbox(); renderNavCounts(); }
}
setInterval(tickOutbox, 10000);

async function sendMessage(m){
  const s = db.settings.whatsapp;
  m.text = renderMessage(m);
  const vars = (() => { const c = db.customers.find(x => x.id === m.customerId); return c ? msgVars(c, m.extra) : {}; })();
  try {
    if (m.simulated || s.mode === 'simulate' || isDummyNumber(m.to)){
      m.via = m.simulated ? 'simulated (demo call)' : s.mode === 'simulate' ? 'simulated' : 'simulated (dummy number)';
    } else if (s.mode === 'meta'){
      await sendViaMeta(m, vars); m.via = 'WhatsApp Cloud API';
    } else if (s.mode === 'webhook'){
      await sendViaWebhook(m, vars); m.via = 'webhook';
    }
    m.status = 'sent'; m.sentAt = nowIso(); m.error = '';
    const c = db.customers.find(x => x.id === m.customerId);
    if (c) log(c, `WhatsApp ${TEMPLATE_LABEL[m.template] ? '"' + m.template + '"' : ''} sent to ${m.audience === 'rep' ? m.toName : m.to} (${m.via})`);
    if (m.audience === 'customer' || m.template === 'rep_alert') toastWhatsApp(m);
  } catch (e){
    m.status = 'failed'; m.error = e.message; m.text = ''; // unfreeze so a retry uses current details
  }
}
// Meta WhatsApp Cloud API. Business-initiated messages need approved templates; the body parameters are sent in this order.
const META_PARAMS = {
  welcome: ['customer','project','rep','rep_phone','time'],
  rep_change: ['customer','project','rep','rep_phone','time'],
  rep_alert: ['customer','customer_phone','project','requirement','budget','time'],
  drip1: ['customer','project'], drip2: ['customer','project','rep_phone'], drip3: ['customer','project'],
};
async function sendViaMeta(m, vars){
  const s = db.settings.whatsapp;
  if (!s.token || !s.phoneNumberId) throw new Error('Add the WhatsApp token and phone number ID in Integrations');
  const tmpl = s.metaTemplates[m.template], to = digits(m.to).length === 10 ? '91' + digits(m.to) : digits(m.to);
  const doc = m.attachment && /^https:/i.test(m.attachment.url) ? { link: m.attachment.url, filename: m.attachment.name } : null;
  const body = tmpl
    ? { messaging_product:'whatsapp', to, type:'template', template:{ name: tmpl, language:{ code: s.templateLang || 'en' }, components: [
        ...(doc ? [{ type:'header', parameters:[{ type:'document', document: doc }] }] : []),
        { type:'body', parameters: (META_PARAMS[m.template] || []).map(k => ({ type:'text', text: String(vars[k] || '-') })) } ] } }
    : doc ? { messaging_product:'whatsapp', to, type:'document', document:{ ...doc, caption: m.text } }
          : { messaging_product:'whatsapp', to, type:'text', text:{ body: m.text } };
  const r = await viaProxy(`https://graph.facebook.com/${s.apiVersion}/${s.phoneNumberId}/messages`,
    { method:'POST', headers:{ 'content-type':'application/json', authorization:'Bearer ' + s.token }, body });
  if (r.status < 200 || r.status >= 300) throw new Error(`WhatsApp API ${r.status}: ${String(r.body).slice(0, 200)}`);
}
// Generic webhook: for WhatsApp providers such as Interakt, WATI, AiSensy or Gupshup, or a Zapier/Make flow
async function sendViaWebhook(m, vars){
  const s = db.settings.whatsapp;
  if (!s.webhookUrl) throw new Error('Add the webhook URL in Integrations');
  const headers = { 'content-type':'application/json' };
  if (s.webhookKey) headers[s.webhookHeader || 'Authorization'] = s.webhookKey;
  const r = await viaProxy(s.webhookUrl, { method:'POST', headers, body: {
    event:'whatsapp_message', to: m.to, to_name: m.toName, audience: m.audience, template: m.template, text: m.text,
    attachment: m.attachment, params: Object.fromEntries((META_PARAMS[m.template] || []).map(k => [k, vars[k]])) } });
  if (r.status < 200 || r.status >= 300) throw new Error(`Webhook ${r.status}: ${String(r.body).slice(0, 200)}`);
}
const waLink = m => `https://wa.me/${digits(m.to).length === 10 ? '91' + digits(m.to) : digits(m.to)}?text=${encodeURIComponent(renderMessage(m) + (m.attachment && /^https?:/.test(m.attachment.url) ? '\n' + m.attachment.url : ''))}`;

// Requests to other services go through serve.ps1, which avoids browser CORS blocks and keeps working from localhost
async function viaProxy(url, { method = 'POST', headers = {}, body = '' } = {}){
  if (!/^https?:$/.test(location.protocol)) throw new Error('Open the app through serve.ps1 (http://localhost:8080) to reach ' + new URL(url).host);
  const res = await fetch('/proxy', { method:'POST', headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ url, method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const result=await res.json().catch(()=>({error:{message:'The desktop service did not answer. Restart Glitch.'}}));
  if(!res.ok || !Number.isInteger(result.status))throw new Error(result.error?.message||result.body||'The provider request failed.');
  return result;
}

// ---------- After every call: save the customer, assign, WhatsApp, CRM ----------
function waFromLead(val, phone){
  const v = String(val || '').trim().toLowerCase();
  if (!v) return { number: phone, status:'unconfirmed' };
  if (/^(no|nope|nahi|nahin|नहीं|नही|नाही|ഇല്ല|ના)(\s|$|[,.!।])/.test(v)) return { number:'', status:'declined' };
  const n = normPhone(v);
  if (n) return { number: n, status:'confirmed' };
  return { number: phone, status: /same|yes|haan|हाँ|हां|हो|അതെ|હા/.test(v) ? 'confirmed' : 'unconfirmed' };
}
// Personal notes build up over calls: keep old ones, add new ones, no repeats
function mergeNotes(old, add){
  const parts = [...String(old || '').split(/;\s*/), ...String(add || '').split(/;\s*/)].map(s => s.trim()).filter(Boolean);
  return [...new Map(parts.map(s => [s.toLowerCase(), s])).values()].join('; ');
}
function onCallFinished(info){
  const L = info.lead, p = project(info.projectId);
  if (!p) return;
  if (!info.phone){ if (!['no_response','failed'].includes(L.outcome)) addSys('Test call without a mobile number, so no customer record or WhatsApp. Add a test mobile to try the full flow.'); return; }
  let c = findCustomer(info.phone, p.id, !!info.simulated);
  if (L.outcome === 'do_not_call'){
    if (c){ c.stage = 'Opted out'; cancelPending(c, 'Opted out'); log(c, 'Opted out on a call'); saveDb(); renderAll(); }
    return;
  }
  if (['no_response','failed','wrong_number'].includes(L.outcome)) return;
  const isNew = !c;
  if (!c){ c = { id: uid(), projectId: p.id, phone: info.phone, stage:'New', createdAt: nowIso(), history: [] }; db.customers.push(c); }
  const keep = (a, b) => a || b || '';
  Object.assign(c, {
    simulated:!!info.simulated, name: keep(L.name, c.name), language: info.language, source: (info.simulated?'Demo · ':'') + (info.direction === 'inbound' ? 'Inbound call' : 'Outbound call'),
    requirement: keep(L.requirement, c.requirement), budget: keep(L.budget, c.budget), purpose: keep(L.purpose, c.purpose),
    financing: keep(L.financing, c.financing), timeline: keep(L.timeline, c.timeline), decisionMaker: keep(L.decision_maker, c.decisionMaker),
    siteVisit: keep(L.site_visit, c.siteVisit), callback: keep(L.callback, c.callback), summary: keep(L.summary, c.summary),
    personal: mergeNotes(c.personal, L.personal),
    score: L.score, status: L.status, statusLabel: STATUS_LABEL[L.status] || L.status, outcome: L.outcome,
  });
  if (L.outcome === 'visit_booked' || (L.signals || {}).site_visit === 'booked') c.stage = 'Site visit booked';
  else if (c.stage === 'New') c.stage = 'Contacted';
  const wa = waFromLead(L.whatsapp, info.phone);
  if (wa.status !== 'unconfirmed' || !c.waStatus){ c.whatsapp = wa.number; c.waStatus = wa.status; }
  log(c, `${c.source}: ${OUTCOMES[L.outcome] || L.outcome}, affinity score ${L.score} (${c.statusLabel})`);

  const lines = [];
  const rep = member(c.repId);
  if (!rep || !rep.available){
    const pick = pickRep(c, rep ? [rep.id] : []);
    if (pick){ assignRep(c, pick.rep, 'auto', (rep ? `${rep.name} unavailable; ` : '') + pick.reason); lines.push(`👤 Assigned to ${pick.rep.name} automatically (${c.assignReason})`); }
    else lines.push('⚠ No sales rep is available for this project, so the customer is unassigned. Add or mark a rep available.');
  } else { setFollowUp(c); queueRepAlert(c, rep, 'called again'); lines.push(`👤 Returning customer, still with ${rep.name}`); }
  if (!c.welcomeQueued && c.waStatus !== 'declined'){
    scheduleFollowUps(c);
    lines.push(c.waStatus === 'confirmed' ? `💬 WhatsApp to ${c.whatsapp}: brochure and ${member(c.repId)?.name || 'sales team'}'s contact, then ${db.settings.whatsapp.dripOn ? db.settings.drip.length + ' follow-ups' : 'no follow-ups'}`
      : '💬 WhatsApp messages are waiting: the number was not confirmed on the call. Confirm it in the sheet to send them.');
  } else if (c.waStatus === 'declined') lines.push('💬 Customer did not want WhatsApp messages');
  lines.push(`📋 Saved to the ${p.name} sheet`);
  saveDb(); tickOutbox(); renderAll();
  lines.forEach(l => addSys(l));
  if (!c.simulated && db.settings.crm.autoPush) pushToCrm(c).then(r => addSys(r.ok ? '⇪ Pushed to DaeBuild CRM' : '⚠ DaeBuild push failed: ' + r.msg)).catch(e => addSys('⚠ DaeBuild push failed: ' + e.message));
  return c;
}

// ---------- CRM push (DaeBuild or any CRM with a lead API) ----------
function crmVars(c){
  const p = project(c.projectId) || {}, r = member(c.repId);
  return { customer: c.name || '', customer_phone: c.phone, mobile_10: digits(c.phone).slice(-10), whatsapp: c.whatsapp || '', project: p.name || '', project_id: c.projectId,
    source: c.source || '', requirement: c.requirement || '', budget: c.budget || '', purpose: c.purpose || '', financing: c.financing || '', timeline: c.timeline || '',
    site_visit: c.siteVisit || '', callback: c.callback || '', score: c.score ?? '', status: c.statusLabel || '', stage: c.stage, rep: r?.name || '', rep_phone: r?.phone || '',
    rep_id: c.repId || '', assigned_by: c.assignedBy || '', follow_up: c.followUpText || '', summary: c.summary || '', personal: c.personal || '', language: langShort(c.language || ''), created_at: c.createdAt };
}
function fillJsonTemplate(t, vars){
  const filled = String(t).replace(/\{(\w+)\}/g, (_, k) => JSON.stringify(String(vars[k] ?? '')).slice(1, -1));
  return JSON.parse(filled); // throws if the template is not valid JSON
}
async function pushToCrm(c){
  if(c.simulated)throw new Error('Demo records are not sent to the CRM.');
  const s = db.settings.crm;
  if (!s.url || !s.apiKey) throw new Error('Add the DaeBuild API URL and key in Integrations');
  const headers = { 'content-type':'application/json' };
  headers[s.authHeader || 'api-key'] = (s.authPrefix || '') + s.apiKey;
  const r = await viaProxy(s.url, { method: s.method || 'POST', headers, body: fillJsonTemplate(s.template, crmVars(c)) });
  c.crm = { at: nowIso(), ok: r.status >= 200 && r.status < 300, msg: `${r.status} ${String(r.body || '').slice(0, 160)}` };
  log(c, c.crm.ok ? 'Pushed to DaeBuild' : 'DaeBuild push failed: ' + c.crm.msg);
  saveDb(); renderSheets();
  return c.crm;
}
function afterCustomerChange(c){
  saveDb(); tickOutbox(); renderAll();
  if (!c.simulated && db.settings.crm.autoPush && db.settings.crm.url) pushToCrm(c).catch(() => {});
}

// ---------- Toasts ----------
function toast(text){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), 5000);
}
function toastWhatsApp(m){
  const t = document.createElement('div'); t.className = 'toast wa';
  t.innerHTML = `<div class="wa-head">WhatsApp · ${m.audience === 'rep' ? 'to rep' : 'to customer'} <b></b></div><div class="wa-body"></div>${m.attachment ? '<div class="wa-file">📄 <span></span></div>' : ''}<div class="wa-foot"></div>`;
  t.querySelector('b').textContent = `${m.toName} · ${m.to}`;
  t.querySelector('.wa-body').textContent = m.text.length > 260 ? m.text.slice(0, 260) + '…' : m.text;
  if (m.attachment) t.querySelector('.wa-file span').textContent = m.attachment.name;
  t.querySelector('.wa-foot').textContent = m.via;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), 9000);
}

// ---------- Navigation ----------
function showView(name){
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'view-' + name);
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  store.set('lq.view', name);
  renderAll();
  window.dispatchEvent(new CustomEvent('estate-view', {detail:name}));
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => showView(b.dataset.view));
function renderNavCounts(){
  const pending = db.messages.filter(m => m.status === 'awaiting_confirmation' || m.status === 'failed').length;
  $('navWa').textContent = pending ? ` (${pending})` : '';
  $('navSheets').textContent = db.customers.length ? ` (${db.customers.filter(c => !CLOSED_STAGES.includes(c.stage)).length})` : '';
}
function renderAll(){
  renderProjectSelects(); renderNavCounts();
  if (!$('view-admin').hidden) renderAdmin();
  if (!$('view-sheets').hidden) renderSheets();
  if (!$('view-whatsapp').hidden) renderOutbox();
  if (!$('view-integrations').hidden) renderIntegrations();
  if (!$('view-tests').hidden && typeof renderDiag === 'function') renderDiag();
}

// ---------- Project pickers used by the call console ----------
function renderProjectSelects(){
  [['campProject', p => p.name], ['cProject', p => p.name], ['inLine', p => `${p.name} · ${p.inboundNumber}`]].forEach(([id, label]) => {
    const sel = $(id); if (!sel) return;
    const v = sel.value || store.get('lq.re.' + id);
    sel.innerHTML = '';
    db.projects.forEach(p => sel.add(new Option(label(p), p.id)));
    if (db.projects.some(p => p.id === v)) sel.value = v;
  });
}

// ---------- Projects & team (back office) ----------
let adminProjectId = null;
const PROJECT_FIELDS = [
  ['name','Project name'], ['developer','Developer'], ['location','Location (area, city)'], ['address','Address'],
  ['inboundNumber','Inbound enquiry number'], ['twilioNumber','Twilio number that rings this project (real inbound calls)'], ['rera','RERA number'], ['status','Construction status'], ['possession','Possession'],
  ['landArea','Size of the project'], ['siteVisit','Site visit timings'], ['brochureName','Brochure file name'],
  ['brochureUrl','Brochure link (a public https link is needed for real WhatsApp)'],
  ['offers','Current offer','ta'], ['paymentPlan','Payment plan','ta'], ['charges','What the price includes, other charges','ta'],
  ['amenities','Amenities','ta'], ['connectivity','Connectivity','ta'],
  ['nearby','Nearby places: one per line as "Place: distance, travel time" (the agent uses these when a caller mentions their office, college or school)','ta'], ['faqs','Other questions and answers (one per line)','ta'],
];
const INV_COLS = [['config','Home','text'], ['carpet','Carpet sq ft','number'], ['priceFrom','From (lakh)','number'], ['priceTo','To (lakh)','number'],
  ['total','Total homes','number'], ['available','Available','number'], ['note','Note','text']];
const LOAN_COLS = [['bank','Bank','text'], ['rate','Rate % a year','number'], ['ltv','Max loan % of price','number'], ['tenure','Max years','number'], ['note','Note','text']];
function touchProject(p){ p.updatedAt = nowIso(); saveDb(); $('kbPreview') && ($('kbPreview').textContent = projectKB(p)); $('kbStamp') && ($('kbStamp').textContent = 'Updated ' + fmtDateTime(p.updatedAt)); renderProjectSelects(); }
function editableTable(rows, cols, onChange, onDelete){
  const t = document.createElement('table'); t.className = 'grid edit';
  t.innerHTML = '<thead><tr>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '<th></th></tr></thead>';
  const tb = document.createElement('tbody');
  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    cols.forEach(([k,, type]) => {
      const td = document.createElement('td'), inp = document.createElement('input');
      inp.type = type; inp.value = row[k] ?? ''; if (type === 'number') inp.step = 'any';
      inp.onchange = () => { row[k] = type === 'number' ? +inp.value : inp.value; onChange(); };
      td.appendChild(inp); tr.appendChild(td);
    });
    const td = document.createElement('td'), del = document.createElement('button');
    del.className = 'small'; del.textContent = '✕'; del.title = 'Remove row'; del.onclick = () => onDelete(i);
    td.appendChild(del); tr.appendChild(td); tb.appendChild(tr);
  });
  t.appendChild(tb); return t;
}
function renderAdmin(){
  if (!project(adminProjectId)) adminProjectId = db.projects[0]?.id;
  const tabs = $('projectTabs'); tabs.innerHTML = '';
  db.projects.forEach(p => {
    const b = document.createElement('button'); b.className = 'tab' + (p.id === adminProjectId ? ' on' : '');
    b.textContent = p.name; b.onclick = () => { adminProjectId = p.id; renderAdmin(); }; tabs.appendChild(b);
  });
  const p = project(adminProjectId), ed = $('projectEditor'); ed.innerHTML = '';
  if (p){
    const form = document.createElement('div'); form.className = 'fields';
    PROJECT_FIELDS.forEach(([k, label, kind]) => {
      const wrap = document.createElement('label'); wrap.className = kind === 'ta' ? 'wide' : ''; wrap.textContent = label;
      const inp = document.createElement(kind === 'ta' ? 'textarea' : 'input'); if (kind === 'ta') inp.rows = 3;
      inp.value = p[k] ?? ''; inp.onchange = () => { p[k] = inp.value; touchProject(p); if (k === 'name'){const b=document.querySelector('#projectTabs .tab.on');if(b)b.textContent=p.name;} };
      wrap.appendChild(inp); form.appendChild(wrap);
    });
    ed.appendChild(form);
    const review = document.createElement('label'); review.className = 'review-project';
    const approval = document.createElement('input'); approval.type='checkbox'; approval.checked=!!p.verified;
    approval.onchange=()=>{ p.verified=approval.checked; p.verifiedAt=approval.checked?nowIso():null; touchProject(p); };
    review.append(approval,' I have verified the project facts, prices, nearby places and brochure for live calls.'); ed.appendChild(review);
    const h1 = document.createElement('h3'); h1.textContent = 'Homes, prices and availability'; ed.appendChild(h1);
    ed.appendChild(editableTable(p.inventory, INV_COLS, () => touchProject(p), i => { p.inventory.splice(i, 1); touchProject(p); renderAdmin(); }));
    const addInv = document.createElement('button'); addInv.textContent = '+ Add home type';
    addInv.onclick = () => { p.inventory.push({ config:'', carpet:0, priceFrom:0, priceTo:0, total:0, available:0, note:'' }); touchProject(p); renderAdmin(); };
    ed.appendChild(addInv);
    const h2 = document.createElement('h3'); h2.textContent = 'Home loan tie-ups'; ed.appendChild(h2);
    ed.appendChild(editableTable(p.loans, LOAN_COLS, () => touchProject(p), i => { p.loans.splice(i, 1); touchProject(p); renderAdmin(); }));
    const addLoan = document.createElement('button'); addLoan.textContent = '+ Add bank';
    addLoan.onclick = () => { p.loans.push({ bank:'', rate:0, ltv:80, tenure:20, note:'' }); touchProject(p); renderAdmin(); };
    ed.appendChild(addLoan);
    const kb = document.createElement('details'); kb.className = 'kb';
    kb.innerHTML = `<summary>What the agent knows about ${escHtml(p.name)} <span class="hint" id="kbStamp">Updated ${fmtDateTime(p.updatedAt)}</span></summary><pre id="kbPreview"></pre>`;
    ed.appendChild(kb); $('kbPreview').textContent = projectKB(p);
    const del = document.createElement('button'); del.className = 'small danger-outline'; del.textContent = 'Delete this project';
    del.onclick = () => {
      if (db.customers.some(c => c.projectId === p.id)) return alert('This project has customers in its sheet. Move or delete them first.');
      if (!confirm(`Delete ${p.name}?`)) return;
      db.projects = db.projects.filter(x => x.id !== p.id); db.team.forEach(m => m.projects = m.projects.filter(id => id !== p.id));
      saveDb(); adminProjectId = null; renderAll();
    };
    ed.appendChild(del);
  }
  renderTeam();
}
function renderTeam(){
  const t = $('teamTable');
  t.innerHTML = '<thead><tr><th>Name</th><th>Role</th><th>Mobile</th><th>Email</th><th>Reports to</th><th>Reports</th><th>Projects</th><th>Languages</th><th>Shift</th><th>Weekly off</th><th>Available</th><th>Open leads</th><th></th></tr></thead>';
  const tb = document.createElement('tbody');
  db.team.forEach(m => {
    const tr = document.createElement('tr');
    const cell = el => { const td = document.createElement('td'); td.appendChild(el); tr.appendChild(td); return td; };
    const text = (k, ph) => { const i = document.createElement('input'); i.value = m[k] || ''; i.placeholder = ph || ''; i.setAttribute('aria-label', k+' for '+m.name); i.oninput = () => { m[k] = i.value; saveDb(); }; return i; };
    cell(text('name'));
    const role = document.createElement('select'); Object.entries(ROLE_LABEL).forEach(([k, v]) => role.add(new Option(v, k))); role.value = m.role;
    role.onchange = () => { m.role = role.value; saveDb(); }; cell(role);
    cell(text('phone', '+91 …'));
    const email=text('email','name@company.com');email.type='email';email.setAttribute('aria-label','Email for '+m.name);cell(email);
    const manager=document.createElement('select');manager.setAttribute('aria-label','Reporting manager for '+m.name);manager.add(new Option('No manager',''));db.team.filter(x=>x.id!==m.id).forEach(x=>manager.add(new Option(x.name,x.id)));manager.value=m.managerId||'';
    manager.onchange=()=>{let id=manager.value,seen=new Set([m.id]);while(id){if(seen.has(id)){manager.value=m.managerId||'';return toast('A reporting hierarchy cannot contain a cycle.');}seen.add(id);id=member(id)?.managerId;}m.managerId=manager.value;saveDb();};cell(manager);
    const report=document.createElement('div');for(const [key,label]of [['dailyReport','Daily email'],['reportAll','All projects']]){const l=document.createElement('label'),cb=document.createElement('input');cb.type='checkbox';cb.checked=!!m[key];cb.onchange=()=>{m[key]=cb.checked;saveDb();};l.append(cb,' '+label);report.appendChild(l);}cell(report);
    const pj = document.createElement('div'); pj.className = 'checks';
    db.projects.forEach(p => {
      const l = document.createElement('label'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = m.projects.includes(p.id);
      cb.onchange = () => { m.projects = cb.checked ? [...m.projects, p.id] : m.projects.filter(x => x !== p.id); saveDb(); };
      l.append(cb, ' ' + p.name.replace(/^Raghav /, '')); pj.appendChild(l);
    });
    cell(pj);
    const lg = document.createElement('input'); lg.value = m.languages.map(c => c.split('-')[0]).join(', '); lg.title = 'Language codes, e.g. mr, hi, en, ml, gu';
    lg.onchange = () => { m.languages = lg.value.split(/[ ,]+/).filter(Boolean).map(x => x.toLowerCase() + '-IN').filter(c => LANG_CODES.includes(c)); saveDb(); };
    cell(lg);
    const sh = document.createElement('div'); sh.className = 'row';
    ['shiftStart','shiftEnd'].forEach(k => { const i = document.createElement('input'); i.type = 'time'; i.value = m[k] || ''; i.onchange = () => { m[k] = i.value; saveDb(); }; sh.appendChild(i); });
    cell(sh);
    const off = document.createElement('select'); ['None','Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => off.add(new Option(d, d === 'None' ? '' : d)));
    off.value = m.weeklyOff || ''; off.onchange = () => { m.weeklyOff = off.value; saveDb(); }; cell(off);
    const av = document.createElement('label'); av.className = 'switch'; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = m.available;
    cb.onchange = () => setAvailability(m, cb.checked); av.append(cb, cb.checked ? ' Yes' : ' Absent'); cell(av);
    const load = document.createElement('span'); load.textContent = m.role === 'sales' ? activeLoad(m.id) : '–'; cell(load);
    const del = document.createElement('button'); del.className = 'small'; del.textContent = '✕';
    del.onclick = () => {
      if (db.customers.some(c => c.repId === m.id && !CLOSED_STAGES.includes(c.stage))) return alert(`${m.name} still has open customers. Mark them absent first so their customers are reassigned.`);
      if (confirm(`Remove ${m.name}?`)){ db.team = db.team.filter(x => x.id !== m.id); saveDb(); renderTeam(); }
    };
    cell(del);
    tb.appendChild(tr);
  });
  t.appendChild(tb);
}
$('newProject').onclick = async () => {
  const name = await gPrompt('Project name'); if (!name) return;
  const p = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid().slice(-4), name, developer: db.company, location:'', address:'', inboundNumber:'', rera:'', status:'',
    possession:'', landArea:'', amenities:'', connectivity:'', paymentPlan:'', charges:'', offers:'', siteVisit:'', brochureName:'', brochureUrl:'', inventory:[], loans:[], faqs:'', updatedAt: nowIso() };
  db.projects.push(p); adminProjectId = p.id; saveDb(); renderAll();
};
$('resetDemo').onclick = () => {
  if (!confirm('Replace ALL projects, team, customers and WhatsApp messages with the dummy data? Your settings and keys are kept.')) return;
  const settings = db.settings; db = freshDb(); db.settings = settings; saveDb(); adminProjectId = null; renderAll(); toast('Dummy data restored');
};
$('addMember').onclick = () => {
  db.team.push({ id: uid(), name:'New member', role:'sales', phone:'', projects: adminProjectId ? [adminProjectId] : [], languages:['en-IN','hi-IN'], shiftStart:'10:00', shiftEnd:'19:00', weeklyOff:'', available:true });
  saveDb(); renderTeam();
};

// ---------- Assignment sheets: one per project ----------
let sheetProjectId = null, sheetPage = 0;
function renderPager(id,anchor,total,page,onChange){
 let nav=$(id);if(!nav){nav=document.createElement('div');nav.id=id;nav.className='row';nav.style.margin='12px 0';$(anchor).closest('table').parentElement.after(nav);}
 nav.hidden=total<=100;nav.innerHTML='';if(nav.hidden)return;
 const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');label.className='hint';
 prev.textContent='← Previous';next.textContent='Next →';prev.disabled=page===0;next.disabled=(page+1)*100>=total;
 prev.onclick=()=>onChange(page-1);next.onclick=()=>onChange(page+1);label.textContent=(page*100+1)+'–'+Math.min(total,(page+1)*100)+' of '+total;
 nav.append(prev,label,next);
}
const SHEET_COLS = ['Customer','Mobile','WhatsApp','Language','Looking for','Budget','Personal notes','Score','Stage','Assigned to','Assigned','Follow-up','Site visit','Source','Updated','DaeBuild'];
function sheetRows(pid){
  const q = ($('sheetSearch').value || '').toLowerCase(), all = $('sheetClosed').checked;
  return db.customers.filter(c => c.projectId === pid && (all || !CLOSED_STAGES.includes(c.stage)) &&
    (!q || (c.name || '').toLowerCase().includes(q) || digits(c.phone).includes(digits(q) || '#')))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
function renderSheets(){
  if (!project(sheetProjectId)) sheetProjectId = db.projects[0]?.id;
  const tabs = $('sheetTabs'); tabs.innerHTML = '';
  db.projects.forEach(p => {
    const n = db.customers.filter(c => c.projectId === p.id && !CLOSED_STAGES.includes(c.stage)).length;
    const b = document.createElement('button'); b.className = 'tab' + (p.id === sheetProjectId ? ' on' : '');
    b.textContent = `${p.name} (${n})`; b.onclick = () => { sheetProjectId = p.id; sheetPage=0; renderSheets(); }; tabs.appendChild(b);
  });
  const t = $('sheetTable'), rows = sheetRows(sheetProjectId);
  sheetPage=Math.min(sheetPage,Math.max(0,Math.ceil(rows.length/100)-1));
  const loads=new Map();db.customers.forEach(c=>{if(!CLOSED_STAGES.includes(c.stage))loads.set(c.repId,(loads.get(c.repId)||0)+1);});
  renderPager('sheetPager','sheetTable',rows.length,sheetPage,p=>{sheetPage=p;renderSheets();});
  t.innerHTML = '<thead><tr>' + SHEET_COLS.map(c => `<th>${c}</th>`).join('') + '</tr></thead>';
  const tb = document.createElement('tbody');
  if (!rows.length) tb.innerHTML = `<tr><td colspan="${SHEET_COLS.length}" class="hint">No ongoing customers yet. They appear here automatically when a call ends.</td></tr>`;
  rows.slice(sheetPage*100,(sheetPage+1)*100).forEach(c => {
    const tr = document.createElement('tr'); tr.title = (c.history || []).slice(-6).map(h => `${fmtDateTime(h.at)}  ${h.text}`).join('\n');
    const td = (content) => { const d = document.createElement('td'); if (content instanceof Node) d.appendChild(content); else d.textContent = content ?? ''; tr.appendChild(d); return d; };
    td(c.name || '–'); td(c.phone);
    const wa = document.createElement('span');
    if (c.waStatus === 'confirmed') wa.innerHTML = `${escHtml(c.whatsapp)} <span class="pill ok">✓</span>`;
    else if (c.waStatus === 'declined') wa.innerHTML = '<span class="pill">Declined</span>';
    else {
      wa.innerHTML = `${escHtml(c.whatsapp || c.phone)} `;
      const b = document.createElement('button'); b.className = 'small'; b.textContent = 'Confirm';
      b.onclick = async () => { const n = await gPrompt('WhatsApp number for ' + (c.name || c.phone), c.whatsapp || c.phone); if (n === null) return; const np = normPhone(n); if (!np) return alert('Not a valid mobile number'); confirmWhatsApp(c, np); };
      wa.appendChild(b);
    }
    td(wa); td(langShort(c.language)); td(c.requirement); td(c.budget); td(c.personal || '');
    td(Object.assign(document.createElement('span'), { className:'badge ' + (c.status || ''), textContent: c.score ?? '–' }));
    const st = document.createElement('select'); STAGES.forEach(s => st.add(new Option(s, s))); st.value = c.stage;
    st.onchange = () => { c.stage = st.value; log(c, 'Stage changed to ' + st.value); if (CLOSED_STAGES.includes(c.stage)) cancelPending(c, 'Stage: ' + c.stage); afterCustomerChange(c); };
    td(st);
    const rs = document.createElement('select'), reps = db.team.filter(m => m.role === 'sales');
    rs.add(new Option('Unassigned', ''));
    const mine = document.createElement('optgroup'); mine.label = 'This project'; const others = document.createElement('optgroup'); others.label = 'Other projects';
    reps.forEach(m => { const o = new Option(`${m.name}${m.available ? '' : ' (absent)'} · ${loads.get(m.id)||0} open`, m.id); o.disabled = !m.available && m.id !== c.repId; (m.projects.includes(c.projectId) ? mine : others).appendChild(o); });
    rs.append(mine, others); rs.value = c.repId || '';
    rs.onchange = async () => {
      const rep = member(rs.value); if (!rep){ rs.value = c.repId || ''; return; }
      const reason = await gPrompt(`Why move ${c.name || 'this customer'} to ${rep.name}? The customer gets a WhatsApp with the new contact.`, member(c.repId) ? `${member(c.repId).name} unavailable` : 'Manual assignment');
      if (reason === null){ rs.value = c.repId || ''; return; }
      assignRep(c, rep, 'manual', reason || 'Manual override'); afterCustomerChange(c); toast(`${c.name || c.phone} is now with ${rep.name}`);
    };
    td(rs);
    td(c.repId ? `${c.assignedBy === 'manual' ? 'Manual' : 'Auto'} · ${c.assignReason || ''}` : '');
    td(c.followUpText || ''); td(c.siteVisit || ''); td(c.source || ''); td(fmtDateTime(c.updatedAt));
    const crm = document.createElement('span');
    if (c.crm) crm.innerHTML = c.crm.ok ? `<span class="pill ok">✓ ${escHtml(fmtDateTime(c.crm.at))}</span> ` : `<span class="pill err" title="${escHtml(c.crm.msg)}">Failed</span> `;
    const pb = document.createElement('button'); pb.className = 'small'; pb.textContent = c.crm?.ok ? 'Push again' : 'Push';
    pb.onclick = async () => { pb.disabled = true; try { const r = await pushToCrm(c); toast(r.ok ? 'Pushed to DaeBuild' : 'DaeBuild: ' + r.msg); } catch(e){ alert(e.message); } renderSheets(); };
    crm.appendChild(pb); td(crm);
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  const p = project(sheetProjectId);
  $('sheetHint').textContent = p ? `${rows.length} matching customer${rows.length === 1 ? '' : 's'}; up to 100 per page. Hover over a row to see its history. Changing "Assigned to" sends the customer a WhatsApp with the new contact.` : '';
}
let sheetSearchTimer; $('sheetSearch').oninput=()=>{clearTimeout(sheetSearchTimer);sheetSearchTimer=setTimeout(()=>{sheetPage=0;renderSheets();},120);}; $('sheetClosed').onchange=()=>{sheetPage=0;renderSheets();};
function sheetExportRows(pid){
  return db.customers.filter(c => c.projectId === pid).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map(c => {
    const r = member(c.repId);
    return { 'Customer': c.name, 'Mobile': c.phone, 'WhatsApp': c.waStatus === 'declined' ? 'Declined' : `${c.whatsapp || ''}${c.waStatus === 'confirmed' ? ' (confirmed)' : ' (not confirmed)'}`,
      'Language': langShort(c.language), 'Looking for': c.requirement, 'Budget': c.budget, 'Personal notes': c.personal || '', 'Purpose': c.purpose, 'Financing': c.financing, 'Timeline': c.timeline,
      'Affinity score': c.score, 'Status': c.statusLabel, 'Stage': c.stage, 'Assigned to': r?.name || '', 'Rep mobile': r?.phone || '',
      'Assigned by': c.assignedBy || '', 'Reason': c.assignReason || '', 'Follow-up': c.followUpText || '', 'Site visit': c.siteVisit || '', 'Callback': c.callback || '',
      'Source': c.source, 'Summary': c.summary, 'Created': fmtDateTime(c.createdAt), 'Updated': fmtDateTime(c.updatedAt), 'DaeBuild': c.crm ? (c.crm.ok ? 'Synced ' + fmtDateTime(c.crm.at) : 'Failed') : '' };
  });
}
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
$('exportXlsx').onclick = async () => {
  try {
    if (!window.XLSX) await loadScript('vendor/xlsx.full.min.js');
    const wb = XLSX.utils.book_new();
    db.projects.forEach(p => {
      const rows = sheetExportRows(p.id);
      const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['No customers yet']]);
      XLSX.utils.book_append_sheet(wb, ws, p.name.replace(/[\\/?*[\]:]/g, '').slice(0, 31));
    });
    XLSX.writeFile(wb, `assignments-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e){
    const rows = db.projects.flatMap(p => sheetExportRows(p.id).map(r => ({ Project: p.name, ...r })));
    const cols = Object.keys(rows[0] || { Project:'' });
    const csv = [cols.join(','), ...rows.map(r => cols.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type:'text/csv' })); a.download = 'assignments.csv'; a.click();
    toast('Excel library unavailable offline: downloaded a CSV instead');
  }
};
$('pushAllCrm').onclick = async () => {
  const rows = sheetRows(sheetProjectId); if (!rows.length) return;
  if (!confirm(`Push ${rows.length} customer${rows.length > 1 ? 's' : ''} of ${project(sheetProjectId).name} to DaeBuild?`)) return;
  let ok = 0, fail = 0;
  for (const c of rows){ try { (await pushToCrm(c)).ok ? ok++ : fail++; } catch(e){ alert(e.message); return; } }
  toast(`DaeBuild: ${ok} pushed${fail ? `, ${fail} failed` : ''}`);
};

// ---------- WhatsApp outbox + templates ----------
const MSG_STATUS = { scheduled:'Scheduled', awaiting_confirmation:'Needs number confirmed', sent:'Sent', failed:'Failed', cancelled:'Cancelled' };
function renderOutbox(){
  const s = db.settings.whatsapp, f = $('outboxFilter').value;
  $('waModeNote').textContent = s.mode === 'simulate'
    ? 'Simulation mode: messages are logged and shown as pop-ups but not really sent. Use "Open in WhatsApp" to send one by hand, or connect a WhatsApp API in Integrations.'
    : `Sending through ${s.mode === 'meta' ? 'the WhatsApp Cloud API' : 'your webhook'}. Numbers starting +91 55555 (dummy data) are never really messaged.`
      + (s.demoSpeed ? ' Demo speed is on: follow-up "days" are minutes.' : '');
  const list = db.messages.filter(m => f === 'all' || (f === 'pending' ? ['scheduled','awaiting_confirmation','failed'].includes(m.status) : m.status === f))
    .sort((a, b) => (b.sentAt || b.sendAfter).localeCompare(a.sentAt || a.sendAfter));
  const t = $('outboxTable');
  t.innerHTML = '<thead><tr><th>When</th><th>To</th><th>Message</th><th>Status</th><th></th></tr></thead>';
  const tb = document.createElement('tbody');
  if (!list.length) tb.innerHTML = '<tr><td colspan="5" class="hint">No messages yet. They are created automatically when a call ends.</td></tr>';
  list.slice(0, 300).forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td><b></b><br><span class="hint"></span></td><td><div class="hint"></div><div class="msgtext"></div></td><td><span class="pill"></span><div class="hint err"></div></td><td class="actions"></td>`;
    tr.children[0].textContent = fmtDateTime(m.sentAt || m.sendAfter);
    tr.querySelector('b').textContent = m.toName; tr.querySelector('.hint').textContent = `${m.to} · ${m.audience === 'rep' ? 'sales rep' : 'customer'}`;
    tr.children[2].querySelector('.hint').textContent = (TEMPLATE_LABEL[m.template] || m.template) + (m.attachment ? ' · 📄 ' + m.attachment.name : '');
    tr.querySelector('.msgtext').textContent = renderMessage(m);
    const pill = tr.querySelector('.pill'); pill.textContent = MSG_STATUS[m.status] + (m.via ? ` (${m.via})` : ''); pill.classList.add(m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'err' : m.status);
    tr.querySelector('.err').textContent = m.error || '';
    const act = tr.querySelector('.actions');
    const btn = (label, fn) => { const b = document.createElement('button'); b.className = 'small'; b.textContent = label; b.onclick = fn; act.append(b, ' '); };
    if (['scheduled','failed','awaiting_confirmation'].includes(m.status)) btn('Send now', () => {
      if (m.status === 'awaiting_confirmation'){ const c = db.customers.find(x => x.id === m.customerId); if (!c || !confirm(`Send to ${m.to}? This confirms it as ${c.name || 'the customer'}'s WhatsApp number.`)) return; confirmWhatsApp(c, m.to); }
      m.status = 'scheduled'; m.sendAfter = nowIso(); saveDb(); tickOutbox();
    });
    if (m.status !== 'cancelled') { const a = document.createElement('a'); a.className = 'small-link'; a.textContent = 'Open in WhatsApp'; a.href = waLink(m); a.target = '_blank'; a.rel = 'noopener'; act.append(a, ' '); }
    if (['scheduled','awaiting_confirmation'].includes(m.status)) btn('Cancel', () => { m.status = 'cancelled'; saveDb(); renderOutbox(); renderNavCounts(); });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  renderTemplates();
}
$('outboxFilter').onchange = renderOutbox;
function renderTemplates(){
  const box = $('templateEditor'); if (box.dataset.ready) return; box.dataset.ready = '1';
  Object.keys(DEFAULT_TEMPLATES).forEach(k => {
    const l = document.createElement('label'); l.textContent = TEMPLATE_LABEL[k];
    const ta = document.createElement('textarea'); ta.rows = k === 'welcome' ? 8 : 4; ta.value = db.settings.templates[k];
    ta.onchange = () => { db.settings.templates[k] = ta.value; saveDb(); renderOutbox(); };
    l.appendChild(ta); box.appendChild(l);
  });
  const d = document.createElement('div'); d.className = 'hint';
  d.textContent = 'Placeholders: {customer} {customer_phone} {project} {location} {rep} {rep_first} {rep_phone} {time} {brochure_line} {visit_line} {inbound_number} {requirement} {budget} {score} {status} {availability} {banks} {emi_example} {offers} {site_hours} {old_rep}. Follow-ups go out 1, 3 and 6 days after the call and stop when the stage is Booked, Lost or Opted out. Pending messages always use the latest rep and project details.';
  box.appendChild(d);
  const reset = document.createElement('button'); reset.className = 'small'; reset.textContent = 'Reset templates';
  reset.onclick = () => { if (confirm('Restore the default message templates?')){ db.settings.templates = { ...DEFAULT_TEMPLATES }; saveDb(); box.dataset.ready = ''; box.innerHTML = ''; renderOutbox(); } };
  box.appendChild(reset);
}

// ---------- Integrations ----------
function bindSetting(id, obj, key, after){
  const el = $(id); if (!el) return; el.dataset.bound = '1';
  if (el.type === 'checkbox') el.checked = !!obj[key]; else el.value = obj[key] ?? '';
  el.onchange = () => { obj[key] = el.type === 'checkbox' ? el.checked : el.value; saveDb(); after && after(); };
}
function renderIntegrations(){
  if(typeof TW==='function'){
   bindSetting('tw_sid',TW(),'sid',()=>{TW().sid=TW().sid.trim();saveDb();renderLineNote();});
   bindSetting('tw_token',TW(),'token',()=>{TW().token=TW().token.trim();saveDb();syncBridge(false);renderLineNote();});
   bindSetting('tw_publicUrl',TW(),'publicUrl',()=>{TW().publicUrl=TW().publicUrl.trim().replace(/\/+$/,'');saveDb();syncBridge(true);renderLineNote();});
   bindSetting('tw_fillers',TW(),'fillers');
  }
  const w = db.settings.whatsapp, c = db.settings.crm;
  bindSetting('waMode', w, 'mode', renderIntegrations);
  ['apiVersion','phoneNumberId','token','templateLang','webhookUrl','webhookHeader','webhookKey'].forEach(k => bindSetting('wa_' + k, w, k));
  ['demoSpeed','notifyReps','dripOn'].forEach(k => bindSetting('wa_' + k, w, k));
  Object.keys(DEFAULT_TEMPLATES).forEach(k => bindSetting('mt_' + k, w.metaTemplates, k));
  ['url','method','authHeader','authPrefix','apiKey','autoPush','template'].forEach(k => bindSetting('crm_' + k, c, k));
  $('metaBox').hidden = w.mode !== 'meta'; $('webhookBox').hidden = w.mode !== 'webhook';
  $('metaParams').textContent = Object.entries(META_PARAMS).map(([k, v]) => `${k}: ${v.map((x, i) => `{{${i + 1}}} = ${x}`).join(', ')}`).join('\n');
}
$('waTest').onclick = async () => {
  const n = normPhone($('waTestTo').value); if (!n) return alert('Enter a valid mobile number');
  const m = { id: uid(), audience:'customer', to: n, toName:'Test', template:'test', text:`Test message from ${db.company}'s voice agent.`, status:'scheduled', sendAfter: nowIso(), createdAt: nowIso(), attachment:null };
  db.messages.push(m); await sendMessage(m); saveDb(); renderOutbox();
  $('waTestResult').textContent = m.status === 'sent' ? `Sent (${m.via})` : 'Failed: ' + m.error;
};
$('crmTest').onclick = async () => {
  const out = $('crmResult');
  try {
    const sample = db.customers[0] || { id:'test', projectId: db.projects[0].id, name:'Test Lead (AI agent)', phone:'+91 55555 99999', whatsapp:'+91 55555 99999', stage:'New', source:'Outbound call',
      requirement:'2 BHK', budget:'80 lakh', score: 72, statusLabel:'Hot', repId: db.team.find(m => m.role === 'sales')?.id, followUpText:'tomorrow at 11:00 am', summary:'Test lead from the voice agent' };
    out.textContent = 'Payload:\n' + JSON.stringify(fillJsonTemplate(c_tpl(), crmVars(sample)), null, 2);
    if (!db.settings.crm.url || !db.settings.crm.apiKey){ out.textContent += '\n\nAdd the API URL and key to actually send it.'; return; }
    const r = await pushToCrm(sample.id === 'test' ? Object.assign(sample, { history: [] }) : sample);
    out.textContent += `\n\nDaeBuild answered: ${r.msg}`;
  } catch (e){ out.textContent = 'Error: ' + e.message; }
};
const c_tpl = () => db.settings.crm.template;
$('crmReset').onclick = () => { if (confirm('Restore the default field mapping?')){ db.settings.crm.template = DEFAULT_CRM_TEMPLATE; $('crm_template').value = DEFAULT_CRM_TEMPLATE; saveDb(); } };

function gPrompt(title,value=''){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='g-dialog';const f=document.createElement('form');f.method='dialog';const h=document.createElement('h2');h.textContent=title;const label=document.createElement('label');label.textContent=title;const i=document.createElement('input');i.value=value;i.setAttribute('aria-label',title);label.appendChild(i);const row=document.createElement('div');row.className='row';const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.value='cancel';const save=document.createElement('button');save.className='primary';save.textContent='Save';save.value='save';row.append(cancel,save);f.append(h,label,row);d.appendChild(f);document.body.appendChild(d);d.addEventListener('close',()=>{const result=d.returnValue==='save'?i.value.trim():null;d.remove();resolve(result);},{once:true});d.showModal();i.focus();i.select();});}
