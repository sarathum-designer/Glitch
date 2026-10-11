const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {Store}=require('../desktop/database.cjs');const voice=require('../app/voice-core.js');const {createBridge,signed}=require('../desktop/bridge.cjs');
test('language changes preserve meaning and avoid switches on negation',()=>{
 assert.equal(voice.detect('Can we speak in Hindi?','en-IN'),'hi-IN');assert.equal(voice.detect('मुझे तीन बेडरूम चाहिए','en-IN'),'hi-IN');assert.equal(voice.detect('मला घर पाहिजे','hi-IN'),'mr-IN');assert.equal(voice.detect('ഇപ്പോൾ പറയാം','hi-IN'),'ml-IN');assert.equal(voice.detect('budget eighty lakh','hi-IN'),'hi-IN');assert.equal(voice.requestedLanguage('Do not speak Hindi'),null);
});
test('separate Hindi and English voice profiles survive round trip',()=>{
 const m=new Map(),s={get:k=>m.get(k),set:(k,v)=>m.set(k,v)};
 voice.save(s,'en-IN',{...voice.profile(s,'en-IN'),speaker:'priya',pace:1.1});voice.save(s,'hi-IN',{...voice.profile(s,'hi-IN'),speaker:'ritu',pace:0.9});
 assert.equal(voice.profile(s,'hi-IN').speaker,'ritu');assert.equal(voice.profile(s,'en-IN').speaker,'priya');assert.equal(voice.profile(s,'hi-IN').pace,0.9);assert.throws(()=>voice.save(s,'hi-IN',{pace:NaN,temperature:0.5}));
});
test('SQLite persists encrypted values, handles deletion and rolls back invalid batches',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'estateflow-test-')),key=crypto.randomBytes(32);
 const enc=v=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(v),c.final(),c.getAuthTag()]);};
 const dec=b=>{const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString();};
 let s=new Store(dir,enc,dec);s.batch([['lq.customer','private-customer-value'],['lq.key','test-key-value']]);assert.throws(()=>s.batch([['lq.customer','wrong'],['invalid','bad']]));assert.equal(s.all()['lq.customer'],'private-customer-value');s.backup(path.join(dir,'backup.sqlite'));s.close();
 assert.ok(!fs.readFileSync(path.join(dir,'estateflow.sqlite')).includes(Buffer.from('private-customer-value')));
 s=new Store(dir,enc,dec);assert.equal(s.all()['lq.key'],'test-key-value');s.batch([['lq.key',null]]);assert.ok(!('lq.key'in s.all()));s.close();
});
test('data batch with 10,000 customer records is recoverable',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'estateflow-load-')),s=new Store(dir,v=>Buffer.from(v),b=>b.toString());const data=JSON.stringify(Array.from({length:10000},(_,i)=>({id:i,name:'Test lead '+i,projectId:'project-1',language:'hi-IN',score:i%100})));
 const t=performance.now();s.batch([['lq.db',data]]);assert.equal(JSON.parse(s.all()['lq.db']).length,10000);console.log('10,000 records save/read:',Math.round(performance.now()-t),'ms');s.close();
});
test('webhook validation rejects missing credentials and tampered signatures',()=>{
 const f={CallSid:'CA1',SpeechResult:'हिंदी'},url='https://example.com/twilio/gather',token='test-token';const v=url+Object.keys(f).sort().map(k=>k+f[k]).join(''),sig=crypto.createHmac('sha1',token).update(v).digest('base64');
 assert.equal(signed('',url,f,sig),false);assert.equal(signed(token,url,f,sig),true);assert.equal(signed(token,url,{...f,CallSid:'CA2'},sig),false);
});
test('desktop bridge rejects public/private access, serves assets, delivers signed call events',async()=>{
 const b=await createBridge({root:path.join(__dirname,'../app'),token:'session'}),base='http://127.0.0.1:'+b.port,h={'x-estateflow-token':'session','content-type':'application/json'};
 try{
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/bridge/config')).status,403);assert.equal((await fetch(base+'/bridge/config',{headers:{...h,'x-forwarded-for':'1.2.3.4'}})).status,403);
  assert.equal((await fetch(base+'/twilio/voice',{method:'POST',body:'CallSid=CA1'})).status,403);
  await fetch(base+'/bridge/config',{method:'POST',headers:h,body:JSON.stringify({publicUrl:'https://example.com',authToken:'test'})});
  await fetch(base+'/bridge/events?after=-1&client=desktop',{headers:h});
  const form={CallSid:'CA1',From:'+919000000001',To:'+919000000002'},reqPath='/twilio/voice',value='https://example.com'+reqPath+Object.keys(form).sort().map(k=>k+form[k]).join('');
  const sig=crypto.createHmac('sha1','test').update(value).digest('base64');
  const incoming=fetch(base+reqPath,{method:'POST',headers:{'x-twilio-signature':sig},body:new URLSearchParams(form)});
  const events=await(await fetch(base+'/bridge/events?after=0&client=desktop',{headers:h})).json();assert.equal(events.events[0].callSid,'CA1');
  await fetch(base+'/bridge/reply',{method:'POST',headers:h,body:JSON.stringify({callSid:'CA1',twiml:'<Response><Say>Hello</Say></Response>'})});assert.match(await(await incoming).text(),/Hello/);
 }finally{b.close();}
});
test('a slow streamed AI response does not block desktop data requests',async()=>{
 const originalFetch=global.fetch,dns=require('node:dns/promises'),oldLookup=dns.lookup;
 dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
 global.fetch=async(input,options)=>{
  if(String(input).startsWith('https://api.groq.com/'))return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('first'));setTimeout(()=>{c.enqueue(new TextEncoder().encode('last'));c.close();},300);}}),{headers:{'content-type':'text/event-stream'}});
  return originalFetch(input,options);
 };
 const b=await createBridge({root:path.join(__dirname,'../app'),token:'test'}),base='http://127.0.0.1:'+b.port;
 try{
  const slow=await originalFetch(base+'/provider?url='+encodeURIComponent('https://api.groq.com/openai/v1/chat/completions'),{method:'POST',headers:{'x-estateflow-token':'test'},body:'{}'}),reader=slow.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value),'first');
  const t=performance.now(),r=await originalFetch(base+'/bridge/config',{headers:{'x-estateflow-token':'test'}});assert.equal(r.status,200);assert.ok(performance.now()-t<200,'configuration responds before the AI stream finishes');
  assert.equal(new TextDecoder().decode((await reader.read()).value),'last');
 }finally{b.close();global.fetch=originalFetch;dns.lookup=oldLookup;}
});
