/* Shared campaign metrics and scheduling rules. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.GlitchOps=api;})(globalThis,()=>{
 const formatters=new Map();
 const parts=(now=new Date(),tz='Asia/Kolkata')=>{if(!formatters.has(tz))formatters.set(tz,new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));const p=Object.fromEntries(formatters.get(tz).formatToParts(new Date(now)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};};
 const active=a=>a&&['placing','ringing','connected'].includes(a.status);
 function summary(data,projectId,date,tz='Asia/Kolkata'){
  const contacts=data.contacts.filter(c=>!projectId||c.projectId===projectId),all=data.attempts.filter(a=>!a.simulated&&(!projectId||a.projectId===projectId));
  const rows=all.filter(a=>parts(a.startedAt,tz).date===date),connected=rows.filter(a=>a.connectedAt),scores=rows.filter(a=>a.score!==null&&a.score!==undefined&&Number.isFinite(+a.score));
  const customers=data.customers.filter(c=>!c.simulated&&(!projectId||c.projectId===projectId));
  return {attempts:rows.length,connected:connected.length,completed:rows.filter(a=>a.status==='completed').length,unanswered:rows.filter(a=>['no-answer','busy','canceled','no_response'].includes(a.status)).length,failed:rows.filter(a=>a.status==='failed').length,review:rows.filter(a=>a.status==='review').length,active:rows.filter(active).length,averageScore:scores.length?Math.round(scores.reduce((s,a)=>s+Number(a.score),0)/scores.length):null,hot:rows.filter(a=>a.score!=null&&+a.score>=70).length,callbacks:rows.filter(a=>a.outcome==='callback_requested').length,optOuts:rows.filter(a=>a.outcome==='do_not_call').length,visits:customers.filter(c=>c.stage==='Site visit booked').length,pending:contacts.filter(c=>c.state==='queued').length,totalLeads:contacts.length,reachRate:rows.length?Math.round(100*connected.length/rows.length):0,minutes:Math.round(rows.reduce((s,a)=>s+(Number(a.durationSec)||0),0)/6)/10,rows};
 }
 function gate(config,attempts,projectId,now=new Date(),tz='Asia/Kolkata'){
  const p=parts(now,tz);if(!config?.enabled)return 'Paused';
  if(p.time<config.start||p.time>=config.end)return 'Outside calling hours';
  const count=attempts.filter(a=>!a.simulated&&a.projectId===projectId&&parts(a.startedAt,tz).date===p.date).length;
  if(count>=config.dailyLimit)return 'Daily limit reached';
  const last=attempts.filter(a=>!a.simulated&&a.projectId===projectId).at(-1);
  if(last&&+new Date(now)-+new Date(last.endedAt||last.startedAt)<config.gapSec*1000)return 'Waiting between calls';
  return '';
 }
 function config(v){const c={enabled:!!v.enabled,dailyLimit:Number(v.dailyLimit),gapSec:Number(v.gapSec),start:v.start,end:v.end};if(!Number.isInteger(c.dailyLimit)||c.dailyLimit<1||c.dailyLimit>2000||!Number.isFinite(c.gapSec)||c.gapSec<5||c.gapSec>3600||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.end)||c.end<=c.start)throw Error('Use a daily limit of 1–2,000, a gap of 5–3,600 seconds, and an end time after the start time.');return c;}
 return {parts,active,summary,gate,config};
});
