// Real phone calls through Twilio. serve.ps1 receives Twilio's webhooks and hands each turn to this tab;
// the same call engine runs (IVR, agent, scoring, WhatsApp), but speech goes down the phone line:
// the agent's words become <Play> (Sarvam voice) or <Say>, and the customer's reply comes back from Twilio's <Gather>.

const TW = () => db.settings.twilio;
const twBase = () => (TW().publicUrl || '').replace(/\/+$/, '');
const xmlEsc = s => String(s ?? '').replace(/[<>&'"]/g, ch => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' }[ch]));
const twiml = inner => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const e164 = p => { const d = digits(p); return '+' + (d.length === 10 ? '91' + d : d); };
// Languages Twilio's speech recognition and Google voices cover
const TW_LANG = { 'en-IN':'en-IN','hi-IN':'hi-IN','mr-IN':'mr-IN','ml-IN':'ml-IN','gu-IN':'gu-IN','ta-IN':'ta-IN',
  'te-IN':'te-IN','kn-IN':'kn-IN','bn-IN':'bn-IN','pa-IN':'pa-Guru-IN','ur-IN':'ur-IN' };
const TW_VOICE_LANGS = ['en-IN','hi-IN','mr-IN','ml-IN','gu-IN','ta-IN','te-IN','kn-IN','bn-IN','pa-IN'];
const twLang = l => TW_LANG[l] || 'en-IN';
const twVoice = l => `Google.${TW_VOICE_LANGS.includes(l) ? l : 'en-IN'}-Standard-${$('gender').value === 'female' ? 'A' : 'B'}`;

const phone = { out: [], dialing: null, chain: Promise.resolve(), flushed: true, fillerTimer: null, fillers: {}, fillerTurn: 0 };

// ---------- Speaking and listening on a real call ----------
function phoneSay(text, lang){
  const item = { text, lang };
  if (useSarvam(lang)) item.audio = sarvamAudio(text, lang, 8000).then(uploadAudio).catch(() => null); // natural voice, phone quality
  phone.out.push(item);
  return Promise.resolve();
}
// A short "hmm / अच्छा जी" when an answer takes a moment, the way a person fills a pause.
// Clips are made once per language and reused. The real answer follows straight after.
const FILLERS = {
  'en-IN':['Hmm, okay.','Right, one second.','Got it.'], 'hi-IN':['अच्छा जी।','हम्म, ठीक है।','ओके, एक सेकंड।'],
  'mr-IN':['बरं.','हो, एक सेकंद.','ओके, बघूया.'], 'ml-IN':['ശരി.','ഓക്കെ, ഒരു നിമിഷം.','ആണോ, ശരി.'],
  'gu-IN':['સારું.','ઓકે, એક સેકન્ડ.','હા, બરાબર.'], 'ta-IN':['சரி.','ஓகே, ஒரு நிமிஷம்.','ம்ம், சரி.'],
  'te-IN':['సరే.','ఓకే, ఒక్క నిమిషం.','అలాగా, సరే.'], 'kn-IN':['ಸರಿ.','ಓಕೆ, ಒಂದು ನಿಮಿಷ.','ಹೌದಾ, ಸರಿ.'],
  'bn-IN':['আচ্ছা।','ঠিক আছে, এক সেকেন্ড।','হুম, বুঝলাম।'],
};
function prepFillers(lang){
  if (phone.fillers[lang] || !FILLERS[lang]) return;
  phone.fillers[lang] = FILLERS[lang].map(t => {
    const f = { text: t, url: null };
    if (useSarvam(lang)) sarvamAudio(t, lang, 8000).then(uploadAudio).then(u => f.url = u).catch(() => {});
    return f;
  });
}
function sendFiller(sid){
  const list = phone.fillers[$('lang').value];
  if (phone.flushed || !call.active || call.sid !== sid || inIvr() || !TW().fillers || !list) return;
  const f = list[phone.fillerTurn++ % list.length];
  const say = f.url ? `<Play>${xmlEsc(f.url)}</Play>` : (useSarvam($('lang').value) ? '' : `<Say language="${twLang($('lang').value)}" voice="${twVoice($('lang').value)}">${xmlEsc(f.text)}</Say>`);
  if (!say) return; // natural voice not ready yet: better silent than a different voice
  phoneReply(sid, twiml(say + '<Redirect method="POST">/twilio/wait</Redirect>'));
}
async function uploadAudio(dataUrl){
  const r = await fetch('/bridge/audio', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ data: dataUrl.split(',')[1] }) });
  return `${twBase()}/audio/${(await r.json()).id}.mp3`;
}
async function phoneRender(items){
  const parts = [];
  for (const it of items){
    const url = it.audio ? await it.audio : null;
    parts.push(url ? `<Play>${xmlEsc(url)}</Play>` : `<Say language="${twLang(it.lang)}" voice="${twVoice(it.lang)}">${xmlEsc(it.text)}</Say>`);
  }
  return parts.join('');
}
// Replies go out one after another, so a filler can never overtake the answer it covers
function phoneReply(sid, xml){
  phone.chain = phone.chain.then(() => fetch('/bridge/reply', { method:'POST', headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ callSid: sid, twiml: xml }) })).catch(() => {});
  return phone.chain;
}
function phoneListen(){
  if (!call.active) return;
  phone.flushed = true; clearTimeout(phone.fillerTimer);
  const sid = call.sid, ivr = inIvr(), items = phone.out.splice(0);
  prepFillers($('lang').value);
  const multilingual=store.get('lq.phoneMultilingual')==='1' && ['en-IN','hi-IN'].includes($('lang').value) && !ivr;
  const lang = multilingual?'multi':call.phase === 'ivr_lang' ? 'en-IN' : twLang($('lang').value);
  // speechTimeout: let the caller finish, then wait this many whole seconds of silence before answering
  // ("Wait after lead stops talking", 1 second by default). numDigits 1: a key, e.g. * for the language menu, acts at once.
  // Twilio's default bargeIn lets the caller interrupt the agent mid-sentence, like on a normal call.
  const pause = Math.max(1, Math.round(+$('silence').value || 1));
  const xml = phoneRender(items).then(body => twiml(`<Gather input="dtmf speech" action="${xmlEsc(twBase() + '/twilio/gather')}" method="POST" language="${lang}"${multilingual ? ' speechModel="deepgram_nova-3"' : ''}`
    + ` speechTimeout="${pause}" timeout="${ivr ? 6 : 10}" numDigits="1" actionOnEmptyResult="true">${body}</Gather>`));
  phone.chain = phone.chain.then(() => xml).then(x => fetch('/bridge/reply', { method:'POST', headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ callSid: sid, twiml: x }) })).catch(() => {});
  setStatus('listening', ivr ? 'Waiting for a keypress or voice on the phone…' : 'Listening on the phone…');
}
// Say what's buffered ("one moment…"), then keep the line open without listening until the answer is ready
function phoneHold(){
  phone.flushed = true; clearTimeout(phone.fillerTimer);
  const sid = call.sid, items = phone.out.splice(0);
  const xml = phoneRender(items).then(body => twiml(body + '<Redirect method="POST">/twilio/wait</Redirect>'));
  phone.chain = phone.chain.then(() => xml).then(x => fetch('/bridge/reply', { method:'POST', headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ callSid: sid, twiml: x }) })).catch(() => {});
  setStatus('thinking', 'Holding the line…');
}
async function phoneHangup(){
  phone.flushed = true; clearTimeout(phone.fillerTimer);
  const sid = call.sid, items = phone.out.splice(0);
  let target = call.transferTo;
  if (!target && call.lead.outcome === 'transfer_requested'){ // the agent was asked for a person
    const known = call.phone ? findCustomer(call.phone, call.projectId, false) : null;
    target = (known && member(known.repId)?.available ? member(known.repId) : pickRep({ projectId: call.projectId, language: $('lang').value })?.rep)?.phone;
  }
  const dial = target && !isDummyNumber(target) ? `<Dial callerId="${xmlEsc(TW().from)}" timeout="25">${xmlEsc(e164(target))}</Dial>` : '<Hangup/>';
  const xml = phoneRender(items).then(body => twiml(body + dial));
  phone.chain = phone.chain.then(() => xml).then(x => fetch('/bridge/reply', { method:'POST', headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ callSid: sid, twiml: x }) })).catch(() => {});
}

// ---------- Placing a call ----------
function twilioMissing(){
  const t = TW();
  if (!t.sid || !t.token) return 'Add your Twilio Account SID and Auth Token in Integrations → Phone calls.';
  if (!t.from) return 'Choose your Twilio number in Integrations → Phone calls (press Check connection).';
  if (!/^https:\/\//.test(t.publicUrl)) return 'The public address is missing. Choose Connect phone bridge on Overview.';
  if (!/^https?:$/.test(location.protocol)) return 'Open the installed desktop app to make real calls.';
  return '';
}
async function twilioDial(c){
  const say = msg => { $('transcript').innerHTML = ''; addSys('⚠ ' + msg); setStatus('', 'Call not placed'); alert(msg); return false; };
  const missing = twilioMissing(); if (missing) return say(missing);
  if (call.active) return say('A call is already in progress.');
  if(!project(c.projectId)?.verified)return say('Review this project in Projects & team and mark its information verified before live calling.');
  if($('mode').value==='script')return say('Choose and configure an AI conversation engine before live calling.');
  if (phone.dialing) return say('Still dialing the previous number. Wait for it to answer or stop ringing (at most 90 seconds).');
  const mode = $('mode').value;
  if (mode === 'groq' && !$('groqModel').value) await loadGroqModels();
  if ((mode === 'groq' && !$('groqModel').value) || (mode === 'ai' && !$('apiKey').value.trim()))
    return say('The conversation engine is not ready (see the status line under the call buttons). Fix it before placing a real call.');
  const t = TW();
  $('transcript').innerHTML = '';
  addSys(`📞 Calling ${c.name} · ${c.phone} from ${t.from}. This is a real call: their phone will ring.`);
  setStatus('thinking', 'Dialing…');
  const params = new URLSearchParams({ To: e164(c.phone), From: t.from, Url: `${twBase()}/twilio/voice?dir=out&cid=${encodeURIComponent(c.id)}`,
    Method:'POST', StatusCallback: `${twBase()}/twilio/status`, StatusCallbackMethod:'POST', Timeout:'30' });
  ['initiated','ringing','answered','completed'].forEach(e => params.append('StatusCallbackEvent', e));
  let r;
  phone.uncertainDial=false;
  try { r = await twilioApi(`Calls.json`, 'POST', params); } catch (e){ phone.uncertainDial=true; return say('Call status could not be confirmed. Check the provider before retrying.'); }
  if (r.status < 200 || r.status >= 300){
    const msg = r.data.message || r.body;
    say('Twilio did not place the call: ' + msg);
    if (/unverified|trial/i.test(msg)) addSys('A Twilio trial account can only call numbers verified in the Twilio console under Phone Numbers → Verified Caller IDs.');
    if (/geo|permission|international/i.test(msg)) addSys('Allow calls to India in the Twilio console: Voice → Settings → Geo permissions.');
    return false;
  }
  phone.dialing = { sid: r.data.sid, contactId: c.id };
  // Safety net: if Twilio's status updates never arrive, don't stay stuck "dialing"
  phone.dialing.timer = setTimeout(() => { if (phone.dialing && phone.dialing.sid === r.data.sid && !call.active) dialEnded('review'); }, 90000);
  addSys('Ringing… (on a trial account the person hears a short Twilio message first and presses any key)');
  return true;
}
async function twilioApi(path, method = 'GET', params = null){
  const t = TW();
  const r = await viaProxy(`https://api.twilio.com/2010-04-01/Accounts/${t.sid}/${path}`, { method,
    headers: { authorization: 'Basic ' + btoa(t.sid + ':' + t.token), ...(params ? { 'content-type':'application/x-www-form-urlencoded' } : {}) },
    body: params ? params.toString() : '' });
  try { r.data = JSON.parse(r.body); } catch(e){ r.data = {}; }
  return r;
}

// ---------- Events from serve.ps1 ----------
function handleTwilioEvent(ev){
  if (ev.type === 'start'){
    const q = new URLSearchParams(ev.query || '');
    if (call.active){ phoneReply(ev.callSid, twiml('<Say language="en-IN">Sorry, all our lines are busy. We will call you back shortly.</Say><Hangup/>')); return; }
    let start;
    phone.flushed = false; phone.chain = Promise.resolve();
    if (q.get('dir') === 'out'){
      if (phone.dialing) clearTimeout(phone.dialing.timer);
      phone.dialing = null;
      const c = getContacts().find(x => x.id === q.get('cid')) || { id: q.get('cid'), name:'', phone: normPhone(ev.to) || ev.to, projectId: $('campProject').value, lang:'auto' };
      start = startCall({ contact: c, line:'twilio', sid: ev.callSid });
    } else {
      const p = db.projects.find(x => x.twilioNumber && samePhone(x.twilioNumber, ev.to)) || currentProject();
      if(!p?.verified || $('mode').value==='script'){ phoneReply(ev.callSid,twiml('<Say>Our assistant is not yet configured. Please call again later.</Say><Hangup/>'));return; }
      start = startCall({ inbound: { projectId: p.id, phone: normPhone(ev.from) || ev.from }, line:'twilio', sid: ev.callSid });
    }
    Promise.resolve(start).then(ok => { if (!ok) phoneReply(ev.callSid, twiml('<Say language="en-IN">Sorry, our assistant is not available right now. Please try again later.</Say><Hangup/>')); });
    return;
  }
  if (ev.type === 'input'){
    if (!call.active || call.sid !== ev.callSid){ phoneReply(ev.callSid, twiml('<Hangup/>')); return; }
    const d = String(ev.digits || '').trim(), speech = String(ev.speech || '').trim();
    phone.flushed = false; clearTimeout(phone.fillerTimer);
    if (speech && call.phase === 'agent') phone.fillerTimer = setTimeout(() => sendFiller(ev.callSid), 1200);
    if (d) pressKey(d[0]);
    else if (speech) handleUser(speech);
    else if (inIvr()){ if (call.ivrResolve) call.ivrResolve(null); else listen(); }
    else onSilence();
    return;
  }
  if (ev.type === 'status'){
    if (phone.dialing && phone.dialing.sid === ev.callSid){
      if (ev.status === 'ringing') setStatus('thinking', 'Their phone is ringing…');
      // "completed" before the agent took over = they hung up during the ring or the trial message.
      // Before this was handled, the app kept thinking a call was in progress and refused to dial again.
      if (['no-answer','busy','failed','canceled','completed'].includes(ev.status)) dialEnded(ev.status);
      return;
    }
    if (call.active && call.sid === ev.callSid && ev.status === 'completed'){ call.remoteEnded = true; endCall('The customer hung up'); }
  }
}
function dialEnded(status){
  if (!phone.dialing) return;
  const cid = phone.dialing.contactId; clearTimeout(phone.dialing.timer); phone.dialing = null;
  addSys(status === 'completed' ? 'The call ended before the agent picked up (hung up during the ring or the Twilio trial message)' : `Call not answered (${status.replace('-', ' ')})`);
  setStatus('', 'Idle');
  finishContact(cid, { outcome: status === 'failed' ? 'failed' : 'no_response', score: null, status: null });
  scheduleNextDial();
}
// Asks serve.ps1 for every call event numbered after the last one handled. The newest open tab handles calls;
// an older tab is told it's inactive and stays out of the way.
const bridgeClient = uid();
let bridgeSeq = -1, bridgeInactiveShown = false;
async function pollBridge(){
  if (!/^https?:$/.test(location.protocol)) return;
  for (;;){
    if (TW().line !== 'twilio'){ await sleep(1500); continue; }
    try {
      const r = await fetch(`/bridge/events?after=${bridgeSeq}&client=${bridgeClient}`, { cache:'no-store' });
      const j = await r.json();
      if (j.inactive){
        if (!bridgeInactiveShown){ bridgeInactiveShown = true; toast('Another tab of this app is now handling phone calls. Close the extra tabs.'); }
        await sleep(3000); continue;
      }
      bridgeInactiveShown = false;
      for (const ev of j.events || []){
        if (ev.seq <= bridgeSeq) continue;
        bridgeSeq = ev.seq;
        try { handleTwilioEvent(ev); } catch(e){ console.error(e); }
      }
      if (bridgeSeq < 0 || j.seq < bridgeSeq) bridgeSeq = j.seq; // first poll, or serve.ps1 was restarted
    } catch (e){ await sleep(2000); }
  }
}

// ---------- Settings, checks and inbound setup ----------
// Keeps serve.ps1 and this tab in step: the token for checking Twilio's signatures, and the tunnel address.
// tunnel.ps1 tells serve.ps1 the address; the app adopts it (and re-points the Twilio number) unless you typed one yourself.
async function syncBridge(pushUrl){
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const t = TW(), body = {};
    if (t.token) body.authToken = t.token; // never send an empty token: that would switch off the signature check
    if (pushUrl) body.publicUrl = t.publicUrl;
    let cfg = await (await fetch('/bridge/config', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) })).json();
    if (!pushUrl && cfg.publicUrl && cfg.publicUrl !== t.publicUrl){ // tunnel.ps1 reported a new address
      t.publicUrl = cfg.publicUrl; $('tw_publicUrl').value = cfg.publicUrl; saveDb(); renderLineNote();
      // Reconnecting a phone number requires the explicit inbound setup button.
      toast('Public address updated from the tunnel');
    } else if (!cfg.publicUrl && t.publicUrl){ // serve.ps1 was restarted and forgot it
      await fetch('/bridge/config', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ publicUrl: t.publicUrl }) });
    }
  } catch (e){}
}
async function pointNumberAtApp(quiet){
  const t = TW(), n = (t.numbers || []).find(x => x.number === t.from);
  if (!n) return quiet || alert('Press Check connection and choose your Twilio number first.');
  const params = new URLSearchParams({ VoiceUrl: `${twBase()}/twilio/voice`, VoiceMethod:'POST', StatusCallback: `${twBase()}/twilio/status`, StatusCallbackMethod:'POST' });
  const r = await twilioApi(`IncomingPhoneNumbers/${n.sid}.json`, 'POST', params);
  if (r.status >= 200 && r.status < 300){ t.numberSid = n.sid; saveDb(); if (!quiet) toast(`Calls to ${n.number} now come to the app`); return true; }
  if (!quiet) alert('Twilio refused: ' + (r.data.message || r.body));
  return false;
}
async function twilioCheck(){
  const t = TW(), out = $('twResult'), lines = [];
  const show = () => out.textContent = lines.join('\n');
  lines.push('Checking…'); show(); lines.length = 0;
  // 1. The local bridge
  if (!/^https?:$/.test(location.protocol)){
    lines.push('✗ The app was opened straight from the file (the address starts with file:///). Start serve.ps1 and open http://localhost:8080 instead.'); show(); return;
  }
  let cfg;
  try { cfg = await (await fetch('/bridge/config', { cache:'no-store' })).json(); }
  catch (e){ lines.push('✗ The local server is not answering. Start serve.ps1 again (its window may have been closed), then reload this page.'); show(); return; }
  if (cfg.seq === undefined){ lines.push('✗ The local server is an old copy. Start serve.ps1 again (it replaces the old one), then reload this page.'); show(); return; }
  lines.push('✓ Local server is running the phone bridge');
  if (cfg.publicUrl && cfg.publicUrl !== t.publicUrl){ t.publicUrl = cfg.publicUrl; $('tw_publicUrl').value = cfg.publicUrl; saveDb(); }
  await syncBridge(false);
  // 2. The tunnel
  if (!/^https:\/\//.test(t.publicUrl)) lines.push('✗ No public address yet. Use Connect phone bridge on the dashboard, or enter a stable public HTTPS address');
  else {
    try { const r = await fetch(twBase() + '/twilio/ping', { cache:'no-store' }); lines.push((await r.text()) === 'ok' ? `✓ Tunnel works: ${t.publicUrl}` : '✗ Tunnel answered strangely'); }
    catch (e){ lines.push(`✗ The tunnel at ${t.publicUrl} isn't reachable. Restart serve.ps1 to open a new one.`); }
  }
  // 3. The Twilio account
  if (!t.sid || !t.token){ lines.push('✗ Add your Account SID and Auth Token'); show(); return; }
  let r = await viaProxy(`https://api.twilio.com/2010-04-01/Accounts/${t.sid}.json`, { method:'GET', headers:{ authorization:'Basic ' + btoa(t.sid + ':' + t.token) } }).catch(e => ({ status: 0, body: e.message }));
  let acct = {}; try { acct = JSON.parse(r.body); } catch(e){}
  if (r.status !== 200){ lines.push(`✗ Twilio did not accept the SID and token (${acct.message || r.body})`); show(); return; }
  lines.push(`✓ Twilio account "${acct.friendly_name}" (${acct.type === 'Trial' ? 'trial: can only call verified numbers' : acct.type}, ${acct.status})`);
  // 4. Numbers you own, and (trial) numbers you may call
  r = await twilioApi('IncomingPhoneNumbers.json?PageSize=50');
  t.numbers = (r.data.incoming_phone_numbers || []).map(n => ({ sid: n.sid, number: n.phone_number, voiceUrl: n.voice_url }));
  const sel = $('tw_from'); sel.innerHTML = '';
  if (!t.numbers.length){ sel.add(new Option('No numbers on this account yet', '')); lines.push('✗ No Twilio phone number yet: get one in the console (Phone Numbers → Buy a number; trial accounts get one free)'); }
  else {
    t.numbers.forEach(n => sel.add(new Option(n.number, n.number)));
    if (!t.numbers.some(n => n.number === t.from)) t.from = t.numbers[0].number;
    sel.value = t.from;
    const n = t.numbers.find(x => x.number === t.from);
    lines.push(`✓ Calls will come from ${t.from}`);
    lines.push(n.voiceUrl && n.voiceUrl.startsWith(twBase()) ? `✓ Inbound calls to ${t.from} come to the app` : `• Inbound calls to ${t.from} don't reach the app yet: press "Send inbound calls to the app"`);
  }
  if (acct.type === 'Trial'){
    r = await twilioApi('OutgoingCallerIds.json?PageSize=50');
    const ids = (r.data.outgoing_caller_ids || []).map(x => x.phone_number);
    lines.push(ids.length ? `• Verified numbers you can call on the trial: ${ids.join(', ')}` : '✗ No verified numbers: add your mobile under Phone Numbers → Verified Caller IDs');
  }
  saveDb(); show(); renderLineNote();
}
function renderLineNote(){
  const real = TW().line === 'twilio', missing = real ? twilioMissing() : '';
  $('lineNote').innerHTML = real
    ? (missing ? `☎️ <b>Real calls are not set up yet.</b> ${escHtml(missing)}` : `☎️ <b>Real calls are on.</b> Numbers you call really ring, from ${escHtml(TW().from)}. Inbound calls to that number reach the AI receptionist. Keep Glitch running and your computer awake during calls. You can minimise the window.`)
    : '📵 <b>Test mode.</b> Numbers you enter do not ring: the call rings and plays on this computer, and you answer as the customer. Switch the phone line to Twilio for real calls.';
  $('twStatus').textContent = real && !missing ? 'Real calls on' : '';
}

// ---------- Wire up ----------
bindSetting('tw_sid', TW(), 'sid', () => { TW().sid = TW().sid.trim(); saveDb(); renderLineNote(); });
bindSetting('tw_token', TW(), 'token', () => { TW().token = TW().token.trim(); saveDb(); syncBridge(false); renderLineNote(); });
bindSetting('tw_fillers', TW(), 'fillers');
bindSetting('tw_publicUrl', TW(), 'publicUrl', () => { TW().publicUrl = TW().publicUrl.trim().replace(/\/+$/, ''); saveDb(); syncBridge(true); renderLineNote(); });
if (TW().numbers?.length){ $('tw_from').innerHTML = ''; TW().numbers.forEach(n => $('tw_from').add(new Option(n.number, n.number))); $('tw_from').value = TW().from; }
$('tw_from').onchange = () => { TW().from = $('tw_from').value; saveDb(); renderLineNote(); };
$('twCheck').onclick = twilioCheck;
$('twInbound').onclick = async () => { if (await pointNumberAtApp(false)) twilioCheck(); };
$('lineMode').value = TW().line;
$('lineMode').onchange = () => { TW().line = $('lineMode').value; saveDb(); renderLineNote(); if (TW().line === 'twilio' && twilioMissing()) showView('integrations'); };
renderLineNote();
syncBridge(false); setInterval(() => syncBridge(false), 15000);
pollBridge();
// Edge and Chrome freeze background tabs after a while ("sleeping tabs"); a tab holding a Web Lock is exempt,
// so the app keeps answering calls while it sits behind other windows.
let phoneLockTaken = false;
function keepAwake(){
  if (phoneLockTaken || TW().line !== 'twilio' || !navigator.locks) return;
  phoneLockTaken = true;
  navigator.locks.request('lead-qualifier-phone-line', () => new Promise(() => {})).catch(() => { phoneLockTaken = false; });
}
keepAwake(); $('lineMode').addEventListener('change', keepAwake);
