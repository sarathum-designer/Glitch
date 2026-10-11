// Tests tab: an A/B speed-and-quality test with your real keys, and a self-test of every call flow with
// simulated customers and a simulated AI (no keys, no calls, no messages; your data is restored afterwards).

// ================= A/B speed and quality test =================
const AB_TURNS = [
  { say: 'Hi, 2 BHK ka price kya hai?', label: 'Answers the price',
    check: o => /72|बहत्तर|बहात्तर|सत्तर|seventy/i.test(o.reply) ? '' : 'price not mentioned' },
  { say: 'Can we talk in Marathi please?', label: 'Switches to Marathi',
    check: o => o.language === 'mr-IN' && /[ऀ-ॿ]/.test(o.reply) ? '' : `stayed in ${o.language || '?'}` },
  { say: 'हो, मला पुढच्या महिन्यात घ्यायचं आहे आणि बजेट ऐंशी लाख आहे.', label: 'Scores the answer',
    check: o => o.lead?.signals?.timeline === 'within_3m' && o.lead?.signals?.budget_fit === 'fits' ? '' : `signals ${JSON.stringify(o.lead?.signals || {})}` },
];
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const secs = ms => isFinite(ms) ? (ms / 1000).toFixed(2) + ' s' : '–';

async function abBrain(model){
  const keep = { messages: call.messages, phone: call.phone, direction: call.direction, projectId: call.projectId, intent: call.intent, lead: call.lead, lang: $('lang').value };
  Object.assign(call, { messages: [], phone: '+919876500000', direction: 'inbound', projectId: $('campProject').value, intent: null, lead: {} });
  setLang('en-IN');
  const r = { model, firsts: [], totals: [], problems: [], errors: [], samples: [] };
  try {
    for (const t of AB_TURNS){
      call.messages.push({ role:'user', content: t.say });
      let out = null;
      for (let attempt = 0; attempt < 3 && !out; attempt++){
        const t0 = performance.now(); let first = null;
        try {
          out = await groqCall({ model, messages: groqMessages(), onEarly: () => { if (first == null) first = performance.now() - t0; } });
          const total = performance.now() - t0;
          r.firsts.push(first ?? total); r.totals.push(total);
        } catch (e){
          if (e.status === 429 && attempt < 2){ await sleep(Math.min(20, e.retryAfter || 8) * 1000); continue; }
          r.errors.push(e.message); break;
        }
      }
      if (!out) break;
      call.messages.push({ role:'assistant', content: out.reply });
      if (LANG_CODES.includes(out.language)) setLang(out.language);
      const p = t.check(out); if (p) r.problems.push(`${t.label}: ${p}`);
      r.samples.push(out.reply);
    }
  } finally {
    Object.assign(call, keep); setLang(keep.lang);
  }
  return r;
}
async function abVoice(model){
  const g = $('gender').value, speaker = speakersFor(model, g)[0];
  const times = [];
  for (let i = 0; i < 2; i++){
    const text = `नमस्कार! Raghav Legacy मध्ये टू बीएचके बहात्तर लाखांपासून आहे${i ? '.' : '!'}`; // different text each run, so no cache
    const t0 = performance.now();
    try { await fetchSarvam(JSON.stringify({ text, language_code:'mr-IN', model, speaker, pace: 1, speech_sample_rate: 8000, output_audio_codec:'mp3' })); times.push(performance.now() - t0); }
    catch (e){ return { model, speaker, error: e.message }; }
  }
  return { model, speaker, ms: median(times) };
}
let abBest = null;
$('abRun').onclick = async () => {
  if (call.active) return alert('Finish the current call first.');
  const btn = $('abRun'), table = $('abTable'), verdict = $('abVerdict');
  if ($('mode').value !== 'groq' || !$('groqKey').value.trim()) return alert('The speed test compares Groq brains: choose Groq and add your key in the Calls tab first.');
  if (!$('groqModel').value) await loadGroqModels();
  const rank = id => { const i = GROQ_PREFERRED.findIndex(p => id.includes(p)); return i < 0 ? 99 : i; };
  const models = [...$('groqModel').options].map(o => o.value).filter(Boolean).sort((a, b) => rank(a) - rank(b)).slice(0, 4);
  if (!models.length) return alert('No Groq models loaded. Check the Groq key.');
  btn.disabled = true; $('abApply').hidden = true; abBest = null;
  table.innerHTML = '<thead><tr><th>Brain (A/B)</th><th>First words ready</th><th>Full answer</th><th>Checks</th><th>Sample reply</th></tr></thead><tbody></tbody>';
  const tb = table.querySelector('tbody'), results = [];
  for (const m of models){
    const row = tb.insertRow(); row.innerHTML = `<td>${escHtml(m)}</td><td colspan="4" class="hint">Testing…</td>`;
    const r = await abBrain(m); results.push(r);
    const ok = !r.errors.length && r.firsts.length === AB_TURNS.length;
    row.innerHTML = `<td>${escHtml(m)}</td><td><b>${secs(median(r.firsts))}</b></td><td>${secs(median(r.totals))}</td>`
      + `<td>${ok && !r.problems.length ? '<span class="pill ok">all 3 passed</span>' : escHtml([...r.errors, ...r.problems].join('; ') || 'incomplete')}</td><td class="hint">${escHtml(r.samples[1] || r.samples[0] || '')}</td>`;
  }
  let voices = [];
  if ($('sarvamKey').value.trim()){
    const vr = tb.insertRow(); vr.innerHTML = '<td colspan="5" class="hint">Testing Sarvam voices…</td>';
    voices = [await abVoice('bulbul:v3'), await abVoice('bulbul:v2')];
    vr.remove();
    voices.forEach(v => { const row = tb.insertRow(); row.innerHTML = `<td>Voice: Sarvam ${escHtml(v.model)} (${escHtml(v.speaker)})</td><td><b>${v.error ? '–' : secs(v.ms)}</b></td><td colspan="3" class="hint">${escHtml(v.error || 'Time to make one phone-quality sentence')}</td>`; });
  }
  const good = results.filter(r => !r.errors.length && r.firsts.length === AB_TURNS.length && !r.problems.some(p => p.startsWith('Switches')));
  const brain = (good.length ? good : results.filter(r => r.firsts.length)).sort((a, b) => median(a.firsts) - median(b.firsts))[0];
  const okVoices = voices.filter(v => !v.error).sort((a, b) => a.ms - b.ms);
  const v3 = okVoices.find(v => v.model === 'bulbul:v3');
  const voice = okVoices.length ? (v3 && v3.ms - okVoices[0].ms < 300 ? v3 : okVoices[0]) : null; // keep the more natural v3 unless v2 is clearly faster
  if (!brain){ verdict.textContent = 'No brain completed the test. Check the Groq key and try again in a minute (free-tier limits).'; btn.disabled = false; return; }
  abBest = { model: brain.model, voice: voice?.model };
  const estimate = median(brain.firsts) + (voice ? voice.ms : 0) + 700; // + Twilio listening end, tunnel and playback start
  verdict.innerHTML = `<b>Recommended:</b> ${escHtml(brain.model)}${voice ? ' with Sarvam ' + escHtml(voice.model) : ''}. `
    + `Estimated pause on a real call before the agent starts speaking: about <b>${secs(estimate)}</b> (the quick "hmm" filler covers anything over 1.2 s).`
    + (good.length ? '' : ' None of the brains passed every check, so this is simply the fastest; the table shows what went wrong.');
  $('abApply').hidden = false; btn.disabled = false;
};
$('abApply').onclick = () => {
  if (!abBest) return;
  $('groqModel').value = abBest.model; $('groqModel').dispatchEvent(new Event('change'));
  if (abBest.voice){ $('sarvamModel').value = abBest.voice; $('sarvamModel').dispatchEvent(new Event('change')); }
  toast('Recommended setup applied'); renderReadiness();
};

// ================= Call diagnostics =================
function renderDiag(){
  let a = []; try { a = JSON.parse(store.get('lq.diag') || '[]'); } catch(e){}
  const recent = a.slice(0, 40), ok = recent.filter(d => d.ok), sized = ok.filter(d => d.tokensIn);
  const cachePct = sized.length ? Math.round(100 * sized.reduce((s, d) => s + (d.cached || 0), 0) / sized.reduce((s, d) => s + d.tokensIn, 0)) : null;
  $('diagSummary').textContent = recent.length
    ? `Last ${recent.length} AI replies: ${recent.length - ok.length} failed. Median time to first words ${secs(median(ok.map(d => d.firstMs).filter(Boolean)))}`
      + (cachePct != null ? `; ${cachePct}% of the tokens sent came from Groq's cache (cached tokens don't count against the free limit).` : '.')
    : 'No AI replies recorded yet. Make a call, then come back here.';
  const t = $('diagTable');
  t.innerHTML = '<thead><tr><th>When</th><th>Model</th><th>First words</th><th>Full answer</th><th>Tokens in (cached) / out</th><th>Result</th></tr></thead>';
  const tb = document.createElement('tbody');
  recent.forEach(d => {
    const tr = tb.insertRow();
    tr.innerHTML = `<td>${escHtml(new Date(d.at).toLocaleTimeString())}</td><td>${escHtml(d.model || '')}</td><td>${d.firstMs ? secs(d.firstMs) : '–'}</td><td>${d.ms ? secs(d.ms) : '–'}</td>`
      + `<td>${d.tokensIn != null ? `${d.tokensIn} (${d.cached || 0}) / ${d.tokensOut ?? '?'}` : '–'}</td>`
      + `<td>${d.ok ? '<span class="pill ok">✓</span> ' + escHtml(d.reply || '') : '<span class="pill err">✗</span> ' + escHtml(d.err || '')}</td>`;
  });
  t.appendChild(tb);
}
$('diagRefresh').onclick = renderDiag;
$('diagClear').onclick = () => { if (confirm('Clear the diagnostics log?')){ store.del('lq.diag'); renderDiag(); } };
$('diagCopy').onclick = async () => {
  let a = []; try { a = JSON.parse(store.get('lq.diag') || '[]'); } catch(e){}
  const text = JSON.stringify({ app: 'lead-qualifier', copied: new Date().toISOString(), model: $('groqModel').value, line: TW().line, entries: a.slice(0, 60) }, null, 1);
  try { await navigator.clipboard.writeText(text); toast('Diagnostics copied: paste them into the chat'); }
  catch (e){ const w = window.open('', '_blank'); if (w){ w.document.body.innerText = text; } }
};

// ================= Self-test =================
const T = { replies: [], requests: [], spoken: [] };
const waitFor = async (fn, ms = 6000, what = 'condition') => { const t = Date.now(); while (!fn()){ if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await sleep(25); } };
const lastSys = (n = 1) => [...document.querySelectorAll('.msg.sys')].slice(-n).map(m => m.textContent).join(' | ');
// Simulated Groq: handler(body) returns { reply, language, end_call, lead } or { status, body } for an error.
// Streaming requests get the reply fields first and the lead record after `pause` ms, like the real thing.
function fakeNet(handler, { delay = 0, pause = 0 } = {}){
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/bridge/reply')){ T.replies.push(JSON.parse(opts.body).twiml); return new Response('{"ok":true}'); }
    if (u.includes('/bridge/audio')) return new Response('{"id":"clip"}');
    if (u.includes('/bridge/')) return new Response(u.includes('events') ? '{"seq":0,"inactive":false,"events":[]}' : '{}');
    if (u.includes('/openai/v1/models')) return new Response(JSON.stringify({ data:[{ id:'openai/gpt-oss-120b' }, { id:'qwen/qwen3-32b' }] }));
    if (u.includes('/openai/v1/chat')){
      const b = JSON.parse(opts.body); T.requests.push(b);
      if (delay) await sleep(delay);
      const r = handler(b);
      if (r.status) return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers || {} });
      const text = JSON.stringify({ reply: r.reply, language: r.language || 'en-IN', end_call: !!r.end_call, lead: { signals:{}, outcome:'in_progress', ...(r.lead || {}) } });
      if (b.stream){
        const cut = text.indexOf('"lead"'), enc = new TextEncoder(), parts = [text.slice(0, cut), text.slice(cut)];
        return new Response(new ReadableStream({ async start(c){
          for (let i = 0; i < parts.length; i++){ if (i && pause) await sleep(pause); c.enqueue(enc.encode('data: ' + JSON.stringify({ choices:[{ delta:{ content: parts[i] } }] }) + '\n\n')); }
          c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices:[{ message:{ content: text } }] }));
    }
    return new Response('{}', { status: 404 });
  };
}
const userTurns = b => b.messages.filter(m => m.role === 'user').length;

const SCENARIOS = [
  ['Affinity score maths', async (ok) => {
    const s = sig => computeScore({ signals: sig });
    ok(s({ budget_fit:'fits', timeline:'within_3m', financing:'ready', authority:'self', requirement_match:'match', site_visit:'booked' }).score === 100, 'perfect lead = 100');
    ok(s({ budget_fit:'fits', timeline:'within_3m', financing:'ready', authority:'joint_involved', requirement_match:'match', site_visit:'booked' }).score === 97, 'joint decision = 97');
    const w = s({ budget_fit:'stretch', timeline:'3_to_6m', financing:'loan_needed', authority:'joint_absent', requirement_match:'match', site_visit:'interested' });
    ok(w.score === 52 && w.status === 'warm', 'warm example = 52 Warm');
    ok(s({ timeline:'within_3m' }).status === 'early', 'one signal = Too early');
    ok(computeScore({ signals:{ budget_fit:'fits' }, outcome:'do_not_call' }).score === 0, 'opt-out = 0');
  }],
  ['Outbound call: IVR by keypad, site visit, auto-assign, WhatsApp', async (ok) => {
    fakeNet(b => { const done = userTurns(b) >= 2;
      return { reply: done ? 'छान! शनिवारी सकाळी 11 वाजता भेटू.' : 'नमस्कार! कोणता दिवस सोयीचा आहे?', language:'mr-IN', end_call: done,
        lead: { name:'Test Buyer', requirement:'2 BHK', budget:'80 lakh', whatsapp: done ? 'same' : '', site_visit: done ? 'Saturday 11 am' : '',
          signals: { budget_fit:'fits', timeline:'within_3m', financing:'ready', authority:'self', requirement_match:'match', site_visit: done ? 'booked' : 'unknown' }, outcome: done ? 'visit_booked' : 'in_progress' } }; });
    $('cName').value = 'Test Buyer'; $('cPhone').value = '98765 11111'; $('cProject').value = 'raghav-legacy'; $('cLang').value = 'auto'; $('cConsent').checked = true;
    addContact(true);
    await waitFor(() => call.phase === 'ivr_lang' && call.ivrResolve, 6000, 'language menu'); pressKey('3');
    await waitFor(() => call.phase === 'ivr_menu' && call.ivrResolve, 6000, 'main menu'); ok($('lang').value === 'mr-IN', 'key 3 = Marathi'); pressKey('2');
    await waitFor(() => call.phase === 'agent' && !call.busy && call.messages.length === 2, 6000, 'agent greeting');
    handleUser('शनिवारी सकाळी 11, हाच नंबर व्हॉट्सॲपवर आहे');
    await waitFor(() => !call.active, 6000, 'call end'); await sleep(200);
    const c = db.customers.find(x => samePhone(x.phone, '9876511111'));
    ok(c && c.stage === 'Site visit booked' && c.score === 100, 'saved as Site visit booked, score 100');
    ok(c && member(c.repId)?.languages.includes('mr-IN'), 'assigned to a Marathi-speaking rep');
    ok(db.messages.some(m => m.customerId === c?.id && m.template === 'welcome' && m.status === 'sent'), 'WhatsApp welcome with brochure sent');
    ok(db.messages.filter(m => m.customerId === c?.id && m.template.startsWith('drip') && m.status === 'scheduled').length === 3, '3 follow-ups scheduled');
  }],
  ['IVR understands spoken choices', async (ok) => {
    ok(parseLangChoice('मराठी') === 'mr-IN' && parseLangChoice('I want Malayalam') === 'ml-IN' && parseLangChoice('३') === 'mr-IN', 'language by name or native digit');
    ok(parseMenuChoice('I want a site visit') === '2' && parseMenuChoice('call me later') === '4' && parseMenuChoice('stop calling') === '0', 'menu by keywords');
  }],
  ['AI switches language mid-call', async (ok) => {
    fakeNet(b => userTurns(b) >= 2 ? { reply:'बिल्कुल, हिंदी में बात करते हैं। आपका बजट कितना है?', language:'hi-IN' } : { reply:'Hello! How can I help?', language:'en-IN' });
    $('ivrOn').checked = false; setLang('en-IN');
    await startCall(); await waitFor(() => call.phase === 'agent' && !call.busy && call.messages.length === 2, 6000, 'greeting');
    handleUser('Can we speak in Hindi?'); await waitFor(() => !call.busy && call.messages.length === 4, 6000, 'reply');
    ok($('lang').value === 'hi-IN', 'call language is now Hindi');
    handleUser('अस्सी लाख'); await waitFor(() => !call.busy && call.messages.length === 6, 6000, 'next reply');
    ok(T.requests.at(-1).messages.at(-1).content.includes('hi-IN'), 'next request tells the AI the language is Hindi');
    endCall('test over');
  }],
  ['* changes language at any time', async (ok) => {
    fakeNet(b => ({ reply: userTurns(b) > 1 ? 'હા, ગુજરાતીમાં વાત કરીએ.' : 'Hello!', language: userTurns(b) > 1 ? 'gu-IN' : 'en-IN' }));
    $('ivrOn').checked = false; setLang('en-IN');
    await startCall(); await waitFor(() => call.phase === 'agent' && !call.busy && call.messages.length === 2, 6000, 'greeting');
    pressKey('*'); await waitFor(() => call.phase === 'ivr_lang' && call.ivrResolve, 6000, 'language menu after *');
    pressKey('5'); await waitFor(() => !call.busy && call.messages.length === 4, 6000, 'reply in Gujarati');
    ok($('lang').value === 'gu-IN', 'call language is now Gujarati');
    ok(T.requests.at(-1).messages.some(m => /pressed \* and chose Gujarati/.test(m.content)), 'the AI was told to continue in Gujarati');
    endCall('test over');
  }],
  ['Speaks before the whole answer has arrived', async (ok) => {
    fakeNet(() => ({ reply:'Hello, quick answer!', language:'en-IN' }), { pause: 1500 });
    $('ivrOn').checked = false; setLang('en-IN'); T.spoken = [];
    const t0 = performance.now(); startCall();
    await waitFor(() => T.spoken.length > 0, 6000, 'speech');
    const spokeAt = performance.now() - t0;
    await waitFor(() => !call.busy && call.messages.length === 2, 6000, 'turn end'); await sleep(1700);
    ok(spokeAt < 1200, `first words after ${Math.round(spokeAt)} ms, while the rest took 1.5 s more`);
    endCall('test over');
  }],
  ['Recovers when the AI tries to call a tool', async (ok) => {
    const toolErr = failed => ({ status: 400, body: { error: { message:'Tool choice is none, but model called a tool', code:'tool_use_failed', ...(failed ? { failed_generation: failed } : {}) } } });
    let plan = [];
    fakeNet(b => plan.length ? plan.shift()(b) : { reply:'ok', language:'en-IN' });
    $('ivrOn').checked = false; setLang('en-IN');
    await startCall(); await waitFor(() => call.phase === 'agent' && !call.busy && call.messages.length === 2, 6000, 'greeting');
    plan = [() => toolErr(JSON.stringify({ name:'json', arguments: JSON.stringify({ reply:'Recovered answer', language:'en-IN', end_call:false, lead:{ signals:{}, outcome:'in_progress' } }) }))];
    handleUser('one'); await waitFor(() => !call.busy && call.messages.length === 4, 6000, 'recovered reply');
    ok(call.messages.at(-1).content === 'Recovered answer', 'answer recovered from the rejected output');
    plan = [() => toolErr(), () => toolErr(), () => ({ reply:'From the other model', language:'en-IN' })];
    handleUser('two'); await waitFor(() => !call.busy && call.messages.length === 6, 6000, 'fallback reply');
    ok(T.requests.at(-1).model !== 'openai/gpt-oss-120b', 'another model answered after repeated failures');
    plan = [() => toolErr(), () => toolErr(), () => toolErr()];
    handleUser('three'); await waitFor(() => !call.busy && T.spoken.at(-1) === SAY_AGAIN['en-IN'], 6000, 'apology');
    ok(call.active, 'call stays up and the agent asks them to repeat');
    endCall('test over');
  }],
  ['Waits and retries when Groq is busy', async (ok) => {
    let first = true;
    fakeNet(() => { if (first){ first = false; return { status: 429, body: { error: { message:'Rate limit reached. Please try again in 1s.' } }, headers: { 'retry-after':'1' } }; } return { reply:'Hello after the wait', language:'en-IN' }; });
    $('ivrOn').checked = false; setLang('en-IN');
    await startCall(); await waitFor(() => call.messages.length === 2 && !call.busy, 8000, 'reply after retry');
    ok(call.messages.at(-1).content === 'Hello after the wait', 'answered after a 1-second wait');
    endCall('test over');
  }],
  ['Daily limit on one model: another answers at once', async (ok) => {
    for (const k in groqResting) delete groqResting[k];
    fakeNet(b => b.model === 'openai/gpt-oss-120b'
      ? { status: 429, body: { error: { message:'Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` on tokens per day (TPD): Limit 200000, Used 199990, Requested 2500. Please try again in 7m12.5s.' } } }
      : { reply:'Hello from the other model', language:'en-IN' });
    $('ivrOn').checked = false; setLang('en-IN');
    const t0 = performance.now();
    await startCall(); await waitFor(() => call.messages.length === 2 && !call.busy, 6000, 'reply');
    ok(performance.now() - t0 < 2000 && call.messages.at(-1).content === 'Hello from the other model', 'answered straight away by another model (no waiting)');
    ok(/daily limit/.test(lastSys(3)), 'the switch is shown on screen');
    const before = T.requests.length;
    handleUser('next question'); await waitFor(() => call.messages.length === 4 && !call.busy, 6000, 'next reply');
    ok(T.requests.slice(before).every(r => r.model !== 'openai/gpt-oss-120b'), 'the limited model rests; the next turn goes straight to the other one');
    endCall('test over'); for (const k in groqResting) delete groqResting[k];
  }],
  ['Every model at its limit: "one moment", then the answer', async (ok) => {
    for (const k in groqResting) delete groqResting[k];
    let until = 0;
    fakeNet(b => {
      const last = b.messages.filter(m => m.role === 'user').length;
      if (last >= 2 && Date.now() < until) return { status: 429, body: { error: { message:'Rate limit reached on tokens per minute (TPM). Please try again in 3s.' } }, headers: { 'retry-after':'3' } };
      return { reply: last >= 2 ? 'The 2 BHK starts at 72 lakh.' : 'Hello!', language:'en-IN' };
    });
    $('ivrOn').checked = false; setLang('en-IN');
    await startCall(); await waitFor(() => call.messages.length === 2 && !call.busy, 6000, 'greeting');
    until = Date.now() + 10000; // both models refuse for 10 seconds
    handleUser('What is the price of a 2 BHK?');
    await waitFor(() => T.spoken.includes(HOLD_ON['en-IN']), 12000, 'holding line');
    ok(!T.spoken.includes(SAY_AGAIN['en-IN']), 'says "one moment", not "I didn\'t catch that"');
    await waitFor(() => call.messages.at(-1)?.content === 'The 2 BHK starts at 72 lakh.', 40000, 'the answer after the wait');
    ok(call.messages.filter(m => m.role === 'user').length === 2, 'answered the same question without the caller repeating it');
    endCall('test over'); for (const k in groqResting) delete groqResting[k];
  }],
  ['"Please reduce the length…": trims and still answers', async (ok) => {
    for (const k in groqResting) delete groqResting[k];
    fakeNet(b => b.messages.length > 10
      ? { status: 400, body: { error: { message:'Please reduce the length of the messages or completion.', code:'context_length_exceeded' } } }
      : { reply: 'Answer number ' + b.messages.filter(m => m.role === 'user').length, language:'en-IN' });
    $('ivrOn').checked = false; setLang('en-IN');
    await startCall(); await waitFor(() => call.messages.length === 2 && !call.busy, 6000, 'greeting');
    for (let i = 0; i < 6; i++){ handleUser('question ' + i); await waitFor(() => !call.busy && call.messages.at(-1).role === 'assistant', 8000, 'reply ' + i); }
    ok(!T.spoken.includes(SAY_AGAIN['en-IN']), 'never fell back to "didn\'t catch that"');
    ok(T.requests.at(-1).messages.length <= 10 && /Earlier in this call/.test(T.requests.at(-1).messages.at(-1).content), 'long call: recent turns plus a summary of what\'s known');
    endCall('test over'); for (const k in groqResting) delete groqResting[k];
  }],
  ['Models too small for a phone agent are left out', async (ok) => {
    const keep = { html: $('groqModel').innerHTML, v: $('groqModel').value, key: $('groqKey').value };
    fakeNet(() => ({ reply:'x' }));
    const f = window.fetch;
    window.fetch = async (url, opts) => String(url).includes('/openai/v1/models')
      ? new Response(JSON.stringify({ data:[ { id:'openai/gpt-oss-120b', context_window:131072, max_completion_tokens:65536 },
          { id:'allam-2-7b', context_window:4096 }, { id:'gemma2-9b-it', context_window:8192 }, { id:'qwen/qwen3-32b', context_window:131072 } ] }))
      : f(url, opts);
    $('groqKey').value = 'gsk_selftest'; await loadGroqModels();
    const opts = [...$('groqModel').options].map(o => o.value);
    ok(opts.includes('openai/gpt-oss-120b') && opts.includes('qwen/qwen3-32b'), 'large models listed');
    ok(!opts.includes('allam-2-7b') && !opts.includes('gemma2-9b-it'), '4k and 8k models skipped');
    $('groqModel').innerHTML = keep.html; $('groqModel').value = keep.v; $('groqKey').value = keep.key;
  }],
  ['"Failed to generate JSON": the reply is still spoken', async (ok) => {
    let n = 0;
    fakeNet(b => {
      if (userTurns(b) < 2) return { reply:'Hello!', language:'en-IN', lead:{ name:'Asha', signals:{ budget_fit:'fits' } } };
      n++;
      return n === 1 ? { status: 400, body: { error: { message:'tool_use_failed' } } } // push onto the strict-JSON retry
        : { status: 400, body: { error: { message:"Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.", code:'json_validate_failed',
            failed_generation: '{"reply":"The 2 BHK starts at 72 lakh.","language":"en-IN","end_call":false,"lead":{"name":"Asha","signals":{' } } };
    });
    $('ivrOn').checked = false; setLang('en-IN');
    await startCall(); await waitFor(() => call.messages.length === 2 && !call.busy, 6000, 'greeting');
    handleUser('price?'); await waitFor(() => !call.busy && call.messages.at(-1).role === 'assistant', 8000, 'reply');
    ok(call.messages.at(-1).content === 'The 2 BHK starts at 72 lakh.', 'reply recovered from the broken JSON');
    ok(call.lead.name === 'Asha' && call.lead.signals.budget_fit === 'fits', 'scorecard kept what it knew');
    endCall('test over');
  }],
  ['Personal details: noted, used, saved and remembered', async (ok) => {
    fakeNet(b => {
      const u = userTurns(b);
      if (u === 1) return { reply:'Hello!', language:'en-IN' };
      if (u === 2) return { reply:'Nice, your office in Hinjewadi Phase 1 is just 6 km, about 15 minutes away.', language:'en-IN', lead:{ name:'Ravi', personal:'Works at Hinjewadi Phase 1' } };
      return { reply:'Great, thank you, bye!', language:'en-IN', end_call:true, lead:{ name:'Ravi', personal:'Daughter studies at Indira College, Tathawade', whatsapp:'same', signals:{ budget_fit:'fits' }, outcome:'qualified' } };
    });
    $('ivrOn').checked = false; setLang('en-IN'); $('leadPhone').value = '98765 44444';
    await startCall(); await waitFor(() => call.messages.length === 2 && !call.busy, 6000, 'greeting');
    ok(/Nearby places[\s\S]*Hinjewadi IT Park Phase 1: 6 km, 15 min/.test(T.requests.at(-1).messages[0].content), 'the agent knows the distances to nearby places');
    handleUser('I work in Hinjewadi Phase 1'); await waitFor(() => call.messages.length === 4 && !call.busy, 6000, 'reply');
    handleUser('My daughter studies at Indira College'); await waitFor(() => !call.active, 6000, 'end'); await sleep(200);
    const c = db.customers.find(x => samePhone(x.phone, '9876544444'));
    ok(c && /Hinjewadi/.test(c.personal) && /Indira College/.test(c.personal), 'both details kept on the customer record');
    ok(db.messages.some(m => m.customerId === c?.id && m.template === 'rep_alert' && /Personal: .*Hinjewadi/.test(m.text)), 'the relationship manager\'s WhatsApp alert includes them');
    $('leadPhone').value = '';
    await startCall({ inbound: { projectId:'raghav-legacy', phone:'+91 98765 44444' } }); await waitFor(() => call.messages.length >= 2 || !call.active, 6000, 'returning call');
    ok(/Personal notes from earlier calls: .*Hinjewadi/.test(T.requests.at(-1).messages[0].content), 'remembered on the next call');
    endCall('test over');
  }],
  ['Silence: check in, then hang up', async (ok) => {
    fakeNet(() => ({ reply:'Hello? Can you hear me?', language:'en-IN' }));
    $('ivrOn').checked = false; setLang('en-IN');
    await startCall(); await waitFor(() => call.phase === 'agent' && !call.busy && call.messages.length === 2, 6000, 'greeting');
    call.lastHeard = Date.now() - 25000; onSilence(); await waitFor(() => !call.busy && call.messages.length === 4, 6000, 'check-in');
    ok(call.active && call.nudged, 'asked if they can hear after ~20 s');
    call.lastHeard = Date.now() - 65000; onSilence(); await sleep(100);
    ok(!call.active && /No response/.test(lastSys()), 'hung up after a minute of silence');
  }],
  ['Returning caller: recognised, told about *, no second welcome', async (ok) => {
    fakeNet(b => ({ reply: userTurns(b) > 1 ? 'धन्यवाद, बाय!' : 'नमस्कार परत!', language:'mr-IN', end_call: userTurns(b) > 1,
      lead: { name:'Test Buyer', signals:{ budget_fit:'fits' }, outcome: userTurns(b) > 1 ? 'qualified' : 'in_progress' } }));
    $('ivrOn').checked = true;
    const welcomes = db.messages.filter(m => m.template === 'welcome').length;
    await startCall({ inbound: { projectId:'raghav-legacy', phone:'+91 98765 11111' } });
    await waitFor(() => call.phase === 'agent' && !call.busy && call.messages.length === 2, 6000, 'greeting');
    ok(/Returning customer Test Buyer/.test(T.requests.at(-1).messages[0].content), 'the AI knows the returning customer');
    ok(call.transcript.some(t => t.text.includes(IVR_STAR['mr-IN'])), 'told they can press * to change language');
    handleUser('ठीक आहे'); await waitFor(() => !call.active, 6000, 'call end'); await sleep(200);
    ok(db.messages.filter(m => m.template === 'welcome').length === welcomes, 'no duplicate welcome');
  }],
  ['Opt-out: never called again', async (ok) => {
    $('ivrOn').checked = true; window.__alerts = [];
    $('cName').value = 'No Calls'; $('cPhone').value = '98765 22222'; $('cProject').value = 'raghav-legacy'; $('cLang').value = 'en-IN'; $('cConsent').checked = true;
    addContact(true); await waitFor(() => call.phase === 'ivr_menu' && call.ivrResolve, 6000, 'menu'); pressKey('0');
    await waitFor(() => !call.active, 6000, 'call end');
    ok(getContacts().find(c => c.phone.endsWith('22222'))?.state === 'dnc', 'marked do-not-call');
    $('cName').value = 'No Calls'; $('cPhone').value = '9876522222'; $('cConsent').checked = true; addContact(true);
    ok(__alerts.some(a => /not to be called/.test(a)) && !call.active, 'adding the number again is refused');
  }],
  ['Real call: what Twilio is told to do', async (ok) => {
    T.replies = [];
    fakeNet(b => userTurns(b) >= 3 ? { reply:'Thank you, bye!', language:'en-IN', end_call: true, lead:{ outcome:'qualified' } } : { reply: userTurns(b) >= 2 ? 'Sure, 2 BHK starts at 72 lakh.' : 'Hello from the agent!', language:'en-IN' }, { delay: 0 });
    Object.assign(TW(), { publicUrl:'https://test.trycloudflare.com', fillers: true }); $('tts').value = 'browser';
    $('ivrOn').checked = true;
    const c = { id:'tw1', name:'Phone Test', phone:'+91 98765 33333', projectId:'raghav-legacy', lang:'en-IN', state:'calling' };
    await startCall({ contact: c, line:'twilio', sid:'CAtest' });
    await waitFor(() => T.replies.length >= 1, 6000, 'menu TwiML');
    ok(/<Gather[^>]*speechTimeout="1"[^>]*numDigits="1"/.test(T.replies[0]) && /test\.trycloudflare\.com\/twilio\/gather/.test(T.replies[0]), 'lets the caller finish, answers after 1 second of silence, takes keys at once');
    ok(T.replies[0].includes(IVR_STAR['en-IN']), 'menu mentions * for language');
    handleTwilioEvent({ type:'input', callSid:'CAtest', digits:'1' });
    await waitFor(() => T.replies.length >= 2, 6000, 'greeting TwiML');
    ok(T.replies[1].includes('Hello from the agent!'), 'agent greeting sent to the phone');
    fakeNet(b => userTurns(b) >= 3 ? { reply:'Thank you, bye!', language:'en-IN', end_call: true, lead:{ outcome:'qualified' } } : { reply:'Sure, 2 BHK starts at 72 lakh.', language:'en-IN' }, { delay: 1800 });
    handleTwilioEvent({ type:'input', callSid:'CAtest', speech:'What is the price?' });
    await waitFor(() => T.replies.length >= 4, 6000, 'filler and answer');
    ok(/<Redirect[^>]*>\/twilio\/wait<\/Redirect>/.test(T.replies[2]) && /<Say/.test(T.replies[2]), 'a quick filler covered the 1.8 s wait');
    ok(T.replies[3].includes('72 lakh'), 'then the real answer followed');
    handleTwilioEvent({ type:'input', callSid:'CAtest', speech:'Okay thanks' });
    await waitFor(() => !call.active && T.replies.some(x => x.includes('<Hangup/>')), 8000, 'goodbye and hang-up');
    ok(T.replies.at(-1).includes('Thank you, bye!') && T.replies.at(-1).includes('<Hangup/>'), 'says goodbye, then hangs up');
  }],
  ['Real call: "call in progress" never gets stuck', async (ok) => {
    phone.dialing = { sid:'CAstuck', contactId:'none', timer: null };
    handleTwilioEvent({ type:'status', callSid:'CAstuck', status:'completed' });
    ok(phone.dialing === null, 'a call that ended before pickup frees the line for the next call');
  }],
];

$('selfRun').onclick = async () => {
  if (call.active) return alert('Finish the current call first.');
  const btn = $('selfRun'), out = $('selfOut'); btn.disabled = true; out.innerHTML = '';
  const opsBackup={attempts:store.get('lq.attempts'),issues:store.get('lq.issues')};store.set('lq.testing','1');
  // Back up everything the tests touch
  const backup = { db: JSON.stringify(db), contacts: store.get('lq.contacts'), leads: store.get('lq.leads'), diag: store.get('lq.diag'),
    ui: Object.fromEntries(['mode','groqKey','lang','tts','cName','cPhone','cLang','cProject'].map(id => [id, $(id).value])),
    checks: Object.fromEntries(['ivrOn','autoDial','cConsent'].map(id => [id, $(id).checked])), models: $('groqModel').innerHTML, model: $('groqModel').value };
  const orig = { speak, listen, ringback, ringtone, holdMusic, tone, fetch: window.fetch, alert: window.alert, confirm: window.confirm, prompt: window.prompt, viaProxy };
  const settings = JSON.parse(backup.db).settings;
  db = freshDb(); db.settings = JSON.parse(JSON.stringify(settings));
  Object.assign(db.settings.whatsapp, { mode:'simulate', demoSpeed:true, dripOn:true, notifyReps:true }); db.settings.crm.autoPush = false;
  Object.assign(db.settings.twilio, { line:'local' });
  store.set('lq.contacts', '[]'); renderContacts();
  speak = async (text, lang) => { T.spoken.push(text); if (call.line === 'twilio' && call.active) return phoneSay(text, lang || $('lang').value); };
  listen = () => {}; ringback = ringtone = holdMusic = tone = async () => {};
  window.alert = m => (window.__alerts = window.__alerts || []).push(m); window.confirm = () => true; window.prompt = (q, d) => d;
  viaProxy = async () => ({ status: 200, body: '{}' });
  $('mode').value = 'groq'; $('groqKey').value = 'gsk_selftest'; $('autoDial').checked = false; $('tts').value = 'browser';
  $('groqModel').innerHTML = '<option value="openai/gpt-oss-120b">gpt-oss-120b</option><option value="qwen/qwen3-32b">qwen3-32b</option>'; $('groqModel').value = 'openai/gpt-oss-120b';
  let passed = 0, failed = 0;
  for (const [name, run] of SCENARIOS){
    const div = document.createElement('div'); div.className = 'test-row'; div.innerHTML = `<b></b> <span class="hint">running…</span><ul></ul>`;
    div.querySelector('b').textContent = name; out.appendChild(div);
    const checks = [];
    const ok = (cond, label) => checks.push([!!cond, label]);
    T.requests = []; T.replies = []; T.spoken = [];
    // real-call scenarios need the real phone listen; the others use a silent one
    listen = name.startsWith('Real call') ? orig.listen : () => {};
    try { await run(ok); } catch (e){ checks.push([false, 'error: ' + e.message]); }
    if (call.active){ call.remoteEnded = true; endCall('test cleanup'); }
    await sleep(50);
    const bad = checks.filter(c => !c[0]).length;
    if (bad || !checks.length) failed++; else passed++;
    div.querySelector('.hint').innerHTML = bad ? `<span class="pill err">${bad} failed</span>` : '<span class="pill ok">passed</span>';
    div.querySelector('ul').innerHTML = checks.map(([p, l]) => `<li>${p ? '✓' : '✗'} ${escHtml(l)}</li>`).join('');
  }
  // Restore everything
  Object.assign(window, { fetch: orig.fetch, alert: orig.alert, confirm: orig.confirm, prompt: orig.prompt });
  speak = orig.speak; listen = orig.listen; ringback = orig.ringback; ringtone = orig.ringtone; holdMusic = orig.holdMusic; tone = orig.tone; viaProxy = orig.viaProxy;
  db = JSON.parse(backup.db); saveDb();
  for(const [key,value]of Object.entries(opsBackup)){value==null?store.del('lq.'+key):store.set('lq.'+key,value);}store.del('lq.testing');
  store.set('lq.contacts', backup.contacts || '[]'); store.set('lq.leads', backup.leads || '[]');
  backup.diag ? store.set('lq.diag', backup.diag) : store.del('lq.diag');
  for (const k in groqResting) delete groqResting[k];
  Object.entries(backup.ui).forEach(([id, v]) => $(id).value = v); Object.entries(backup.checks).forEach(([id, v]) => $(id).checked = v);
  $('groqModel').innerHTML = backup.models; $('groqModel').value = backup.model; setLang(backup.ui.lang);
  $('transcript').innerHTML = ''; renderLead({}); renderContacts(); renderLeads(); renderAll(); renderReadiness(); setStatus('', 'Idle');
  const sum = document.createElement('p'); sum.innerHTML = `<b>${passed} of ${passed + failed} tests passed.</b> Your data has been restored.`;
  out.prepend(sum); btn.disabled = false;
};
SCENARIOS.push(
 ['Language voice profiles are used for actual speech requests', async ok=>{
  const savedEn=store.get('lq.voice.en-IN'),savedHi=store.get('lq.voice.hi-IN'),savedFetch=window.fetch,seen=[];
  try{
   EstateVoice.save(store,'en-IN',{...EstateVoice.profile(store,'en-IN'),speaker:'neha',pace:1.15});
   EstateVoice.save(store,'hi-IN',{...EstateVoice.profile(store,'hi-IN'),speaker:'ritu',pace:0.9});
   window.fetch=async(u,o)=>{seen.push(JSON.parse(o.body));return new Response(JSON.stringify({audios:['AAAA']}));};
   ttsCache.clear();setLang('en-IN');await sarvamAudio('English voice test','en-IN');await sarvamAudio('हिंदी आवाज़ परीक्षण','hi-IN');
   ok(seen[0].speaker==='neha'&&seen[1].speaker==='ritu','speech uses each language’s saved speaker, even when the UI is on English');
   ok(seen[0].pace===1.15&&seen[1].pace===0.9,'each language keeps its own speaking pace');
  }finally{window.fetch=savedFetch;savedEn?store.set('lq.voice.en-IN',savedEn):store.del('lq.voice.en-IN');savedHi?store.set('lq.voice.hi-IN',savedHi):store.del('lq.voice.hi-IN');ttsCache.clear();}
 }],
 ['Hindi speech switches the language before requesting the reply',async ok=>{
  fakeNet(b=>({reply:userTurns(b)>1?'हाँ, बताइए।':'Hello!',language:userTurns(b)>1?'hi-IN':'en-IN'}));$('ivrOn').checked=false;setLang('en-IN');
  await startCall();await waitFor(()=>!call.busy&&call.messages.length===2);
  handleUser('मुझे दो बेडरूम चाहिए');ok($('lang').value==='hi-IN','Hindi is selected immediately from the customer’s words');
  await waitFor(()=>!call.busy&&call.messages.length===4);ok(T.requests.at(-1).messages.at(-1).content.includes('hi-IN'),'the next response is requested in Hindi without a detection API call');endCall('test over');
 }],
 ['A failed old request cannot interrupt a newer language turn',async ok=>{
  fakeNet(()=>({reply:'Hello!',language:'en-IN'}));$('ivrOn').checked=false;setLang('en-IN');await startCall();await waitFor(()=>!call.busy&&call.messages.length===2);
  fakeNet(()=>({reply:'Yes, English is fine.',language:'en-IN'}));const nextFetch=window.fetch;let first=true;
  window.fetch=async(u,o)=>{if(String(u).includes('/chat/completions')&&first){first=false;await sleep(200);throw Error('Old request timed out');}return nextFetch(u,o);};
  handleUser('Can we speak Hindi?');await sleep(20);handleUser('English please');await waitFor(()=>call.messages.at(-1)?.content==='Yes, English is fine.');await sleep(300);
  ok($('lang').value==='en-IN','the newer English turn keeps its language');ok(!T.spoken.some(t=>t===SAY_AGAIN['en-IN']||t===SAY_AGAIN['hi-IN']),'the failed old request does not speak over the newer reply');endCall('test over');
 }]
);
SCENARIOS.push(['Demo follow-ups never reach a live provider',async ok=>{
 const originalMode=db.settings.whatsapp.mode,proxy=viaProxy;let sent=0;
 try{
  db.settings.whatsapp.mode='meta';viaProxy=async()=>{sent++;return {status:200,body:'{}'};};
  const c={id:'demo-safety',simulated:true,projectId:'raghav-legacy',name:'Demo',phone:'+919876511111',whatsapp:'+919876511111',waStatus:'confirmed',stage:'Contacted',history:[]};db.customers.push(c);
  const m=queueCustomerMsg(c,'welcome');await sendMessage(m);ok(sent===0&&m.via==='simulated (demo call)','a demo message stays simulated even with live WhatsApp selected');
  let refused=false;try{await pushToCrm(c);}catch{refused=true;}ok(refused&&sent===0,'demo customers cannot be pushed to a live CRM');
  const live={...c,id:'live-safety',simulated:false};db.customers.push(live);scheduleFollowUps(live);const next=db.messages.find(x=>x.customerId===live.id&&x.template==='drip1');ok(Date.parse(next.sendAfter)-Date.now()>23*3600000,'live follow-ups use real days even if demo speed is enabled');
  db.messages=db.messages.filter(x=>!['demo-safety','live-safety'].includes(x.customerId));db.customers=db.customers.filter(x=>!['demo-safety','live-safety'].includes(x.id));
 }finally{db.settings.whatsapp.mode=originalMode;viaProxy=proxy;}
}]);
