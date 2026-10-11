const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Ops=require('../app/ops-core.js'),XLSX=require('../app/vendor/xlsx.full.min.js');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse=(s,d)=>{try{return JSON.parse(s)||d;}catch{return d;}};
function dataset(values){const db=parse(values['lq.db'],{});return {projects:db.projects||[],customers:db.customers||[],team:db.team||[],contacts:parse(values['lq.contacts'],[]),attempts:parse(values['lq.attempts'],[])};}
function sheet(rows){const s=XLSX.utils.aoa_to_sheet(rows);s['!cols']=Array.from({length:Math.max(...rows.map(r=>r.length))},(_,i)=>({wch:i===0?28:22}));return s;}
function build(data,date,tz='Asia/Kolkata',projectId=''){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw Error('Choose a valid report date.');Ops.parts(new Date(),tz);
 const projects=data.projects.filter(p=>!projectId||p.id===projectId);if(!projects.length)throw Error('No matching projects.');
 const wb=XLSX.utils.book_new(),overview=[['Glitch • Daily management report',date,tz],['Live attempts only. Affinity = qualification score, not purchase probability.'],['Project','Attempts','Connected','Reach %','Avg affinity / 100','Hot calls ≥70','Callbacks','Opt-outs','Unanswered','Failed','Review needed','Queued now','Visits booked now','Talk minutes','Project sheet']];
 const items=projects.map((p,i)=>{const m=Ops.summary(data,p.id,date,tz),tab='Project '+(i+1);overview.push([p.name,m.attempts,m.connected,m.reachRate,m.averageScore??'',m.hot,m.callbacks,m.optOuts,m.unanswered,m.failed,m.review,m.pending,m.visits,m.minutes,'Open '+tab]);return {p,m,tab};});
 XLSX.utils.book_append_sheet(wb,sheet(overview),'Dashboard');
 for(let i=0;i<items.length;i++){const {p,m,tab}=items[i],rows=[['Project',p.name,'Report date',date,'Timezone',tz],['Back to dashboard'],['Started','Name','Phone','Provider status','Outcome','Affinity / 100','Connected','Talk seconds','Call ID']];
  for(const a of m.rows)rows.push([a.startedAt,a.name,a.phone,a.status,a.outcome||'',a.score??'',a.connectedAt||'',a.durationSec||0,a.sid||a.id]);
  const s=sheet(rows);s.A2.l={Target:"#'Dashboard'!A1"};s['!autofilter']={ref:`A3:I${Math.max(3,rows.length)}`};XLSX.utils.book_append_sheet(wb,s,tab);wb.Sheets.Dashboard[XLSX.utils.encode_cell({r:i+3,c:14})].l={Target:`#'${tab}'!A1`};
 }
 const filename=`Glitch-report-${date}.xlsx`,cards=items.map(({p,m,tab})=>`<section><h2>${esc(p.name)}</h2><div class="kpis">${[['Attempts',m.attempts],['Connected',m.connected],['Reach rate',m.reachRate+'%'],['Average affinity',m.averageScore??'—'],['Hot calls ≥70',m.hot],['Callbacks',m.callbacks],['No answer / busy',m.unanswered],['Failed',m.failed],['Review needed',m.review],['Queued now',m.pending],['Site visits now',m.visits]].map(([k,v])=>`<div><b>${v}</b><span>${k}</span></div>`).join('')}</div><a href="${filename}#'${encodeURIComponent(tab)}'!A1">Open project Excel sheet →</a></section>`).join('');
 const body=`<h1>Glitch / Management report</h1><p>${esc(date)} · ${esc(tz)} · Generated ${esc(new Date().toISOString())}</p><p>Live attempts only. Affinity is the qualification score, not a buying probability. Queue and site-visit counts are current snapshots; other KPIs use the selected day's attempts. Historic calls before attempt tracking are excluded.</p>${cards}`;
 const html=`<!doctype html><html><head><meta charset="utf-8"><title>Glitch report ${date}</title><style>body{font:15px Segoe UI,Arial;background:#f4f7fa;color:#18243b;max-width:1100px;margin:40px auto;padding:24px}section{background:white;border:1px solid #dde4ed;border-radius:14px;padding:26px;margin:24px 0}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin:20px 0}b,span{display:block}b{font-size:30px}span,p{color:#64748b}a{color:#5341cb}</style></head><body>${body}</body></html>`;
 return {workbook:Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'})),html,emailHtml:body.replace(/<a href="[^"]*">Open project Excel sheet →<\/a>/g,'<p>See the attached Excel workbook; select this project using its Dashboard links.</p>'),filename,items};
}
function createReports({store,dir,fetchImpl=fetch}){
 let busy=false;const read=()=>store.all(),state=()=>parse(read()['lq.reportState'],{}),put=s=>store.batch([['lq.reportState',JSON.stringify(s)]]);
 async function run({date,projectId='',send=false,scheduled=false}={}){
  if(busy)throw Error('A report is already being prepared.');busy=true;
  try{const values=read();if(values['lq.testing']==='1')throw Error('Finish the simulated self-test before reporting.');const cfg=parse(values['lq.reportConfig'],{}),tz=cfg.timezone||'Asia/Kolkata',data=dataset(values);date=date||Ops.parts(new Date(),tz).date;
   const result=build(data,date,tz,projectId),folder=path.join(dir,date,projectId?crypto.createHash('sha256').update(projectId).digest('hex').slice(0,12):'all');fs.mkdirSync(folder,{recursive:true});
   fs.writeFileSync(path.join(folder,result.filename),result.workbook);fs.writeFileSync(path.join(folder,'Dashboard.html'),result.html);
   const s=state();s.lastFile=folder;s.lastGenerated=new Date().toISOString();s.lastDate=date;s.error='';put(s);
   if(send){
    const recipients=data.team.filter(m=>m.dailyReport&&m.email&&data.projects.some(p=>(!projectId||p.id===projectId)&&(m.reportAll||(m.projects||[]).includes(p.id))));
    if(!cfg.key||!cfg.from||!recipients.length)throw Error('Set a Resend API key and verified sender, and select report recipients in Admin.');
    s.jobs=s.jobs||{};
    for(const member of recipients){
     if(!/^\S+@\S+\.\S+$/.test(member.email))throw Error('Invalid email for '+member.name);
     const scope=member.reportAll?data.projects.map(p=>p.id):member.projects||[],scoped={...data,projects:data.projects.filter(p=>scope.includes(p.id)&&(!projectId||p.id===projectId))};if(!scoped.projects.length)continue;
     const mailKey=date+'-'+(projectId||'all')+'-'+member.id;let job=s.jobs[mailKey];if(job?.status==='sent')continue;
     if(!job){const r=build(scoped,date,tz);if(r.workbook.length>15*1024*1024)throw Error('Report too large to email; export it instead.');job=s.jobs[mailKey]={id:'glitch-'+crypto.randomUUID(),created:Date.now(),status:'pending',tries:0,payload:{from:cfg.from,to:[member.email],subject:`Glitch | Daily project report | ${date}`,html:r.emailHtml,attachments:[{filename:r.filename,content:r.workbook.toString('base64')}]}};}
     if(Date.now()-job.created>23*3600000)throw Error('Email delivery uncertain after 23 hours. Check the provider before retrying.');
     if(scheduled&&job.tries>=3)throw Error('Automatic email retries exhausted. Check delivery status before a manual retry.');
     job.tries++;job.lastTry=Date.now();put(s);
     const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+cfg.key,'content-type':'application/json','Idempotency-Key':job.id},body:JSON.stringify(job.payload),signal:AbortSignal.timeout(20000)});
     const response=await r.json().catch(()=>({}));if(!r.ok)throw Error(`Email rejected (${r.status}) for ${member.name}. Check sender, key and quota.`);if(!response.id)throw Error('Email provider did not confirm acceptance.');
     job.status='sent';job.providerId=response.id;delete job.payload;s.lastSent=new Date().toISOString();put(s);
    }
    s.sentDate=date;put(s);
   }
   if(scheduled){const latest=state();latest.generatedDate=date;put(latest);}return {folder,status:send?'Reports accepted by email provider':'Report saved',date};
  }catch(e){const s=state();s.error=e.message;s.lastFailure=Date.now();put(s);throw e;}finally{busy=false;}
 }
 async function tick(){const v=read(),cfg=parse(v['lq.reportConfig'],{});if(!cfg.enabled||busy)return;const p=Ops.parts(new Date(),cfg.timezone||'Asia/Kolkata');if(p.time<(cfg.time||'18:30'))return;const s=state();if(s.generatedDate===p.date&&(!cfg.emailEnabled||s.sentDate===p.date))return;if(Date.now()-(s.lastFailure||0)<300000)return;try{await run({date:p.date,send:!!cfg.emailEnabled,scheduled:true});}catch{}}
 return {run,tick,status:()=>{const s=state();return {lastGenerated:s.lastGenerated,lastSent:s.lastSent,error:s.error,lastDate:s.lastDate};},folder:()=>state().lastFile||dir};
}
module.exports={build,dataset,createReports};
