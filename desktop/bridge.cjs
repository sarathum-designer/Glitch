const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns/promises');
const { Readable } = require('node:stream');

const waitXml = '<Response><Pause length="1"/><Redirect method="POST">/twilio/wait</Redirect></Response>';
const offlineXml = '<Response><Say language="en-IN">Our assistant is unavailable. Please call again later.</Say><Hangup/></Response>';
const fixedHosts = new Set(['api.groq.com','api.sarvam.ai','api.anthropic.com','api.twilio.com','graph.facebook.com']);
const privateIP = s => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::|fc|fd|fe80)/i.test(s);
async function validTarget(raw, allowed) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !allowed.has(u.hostname)) throw Error('This service address is not configured in Integrations.');
  const addresses = await dns.lookup(u.hostname,{all:true});
  if (!addresses.length || addresses.some(a=>privateIP(a.address))) throw Error('Private network addresses are not allowed.');
  return u;
}
async function body(req, limit=12*1024*1024) { let size=0;const parts=[];for await(const b of req){size+=b.length;if(size>limit)throw Error('Request too large');parts.push(b);}return Buffer.concat(parts); }
function signed(token,url,form,signature) {
  if (!token || !signature) return false;
  const s = url + Object.keys(form).sort().map(k=>k+form[k]).join('');
  const expected=crypto.createHmac('sha1',token).update(s).digest('base64');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
async function createBridge({root,modelRoot,token, getSettings=()=>({})}) {
  const state={ seq:0, events:[],pollers:new Set(),holds:new Map(),replies:new Map(), audio:new Map(), config:{publicUrl:'',authToken:''}, activeClient:'',lastPoll:0,tunnelStatus:'Stopped' };
  const send=(r,s,t,b)=>{if(r.writableEnded||r.destroyed)return;r.writeHead(s,{'content-type':t,'cache-control':'no-store','x-content-type-options':'nosniff'});r.end(b);};
  const json=(r,obj,s=200)=>send(r,s,'application/json',JSON.stringify(obj));
  const xml=(r,x)=>send(r,200,'text/xml',x);
  const online=()=>Date.now()-state.lastPoll<30000;
  function answer(p){json(p.res,{seq:state.seq,inactive:p.client!==state.activeClient,events:p.client===state.activeClient?state.events.filter(e=>e.seq>p.after):[]});state.pollers.delete(p);}
  function event(e){state.events.push({...e,seq:++state.seq,at:Date.now()});for(const p of state.pollers)answer(p);}
  function hold(sid,res){if(state.replies.has(sid)){xml(res,state.replies.get(sid).xml);state.replies.delete(sid);return;}if(state.holds.has(sid))xml(state.holds.get(sid).res,waitXml);const h={res,at:Date.now()};state.holds.set(sid,h);res.on('close',()=>{if(state.holds.get(sid)===h)state.holds.delete(sid);});}
  const server=http.createServer(async(req,res)=>{
    try {
      const u=new URL(req.url,'http://localhost'), p=decodeURIComponent(u.pathname);
      const publicRequest=!!(req.headers['cf-connecting-ip']||req.headers['x-forwarded-for']);
      if(p==='/twilio/ping')return send(res,200,'text/plain','ok');
      if(p.startsWith('/twilio/')){
        if(req.method!=='POST')return send(res,405,'text/plain','POST required');
        const form=Object.fromEntries(new URLSearchParams((await body(req,65536)).toString()));
        if(!signed(state.config.authToken,state.config.publicUrl+req.url,form,req.headers['x-twilio-signature']))return send(res,403,'text/plain','Invalid webhook signature');
        const sid=form.CallSid;if(!sid)return send(res,400,'text/plain','CallSid required');
        if(p==='/twilio/status'){event({type:'status',callSid:sid,status:form.CallStatus,duration:form.CallDuration});return xml(res,'<Response/>');}
        if(!online())return xml(res,offlineXml);
        if(p==='/twilio/voice')event({type:'start',callSid:sid,from:form.From,to:form.To,direction:form.Direction,query:u.search});
        else if(p==='/twilio/gather')event({type:'input',callSid:sid,speech:form.SpeechResult,digits:form.Digits,confidence:form.Confidence});
        else if(p!=='/twilio/wait')return send(res,404,'text/plain','Not found');
        return hold(sid,res);
      }
      if(p.startsWith('/audio/')){const a=state.audio.get(path.basename(p,'.mp3'));return a?send(res,200,'audio/mpeg',a.bytes):send(res,404,'text/plain','Expired audio');}
      if(publicRequest)return send(res,403,'text/plain','Private desktop workspace');
      if(p.startsWith('/models/')&&modelRoot){
        const file=path.resolve(modelRoot,p.slice(8));
        if(!file.startsWith(path.resolve(modelRoot)+path.sep)||req.method!=='GET'||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,'text/plain','Model resource unavailable');
        const type={'.gltf':'model/gltf+json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';
        res.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff'});const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      const authorized=req.headers['x-estateflow-token']===token;
      if(p.startsWith('/bridge/')||p==='/proxy'||p==='/provider'){
        if(!authorized)return send(res,403,'text/plain','Desktop session required');
        if(p==='/bridge/config'){
          if(req.method==='POST'){const v=JSON.parse((await body(req)).toString());if(v.publicUrl!==undefined){if(v.publicUrl && !/^https:\/\/[^/]+$/.test(v.publicUrl))throw Error('Use an HTTPS public origin without a path');state.config.publicUrl=v.publicUrl;}if(v.authToken!==undefined)state.config.authToken=v.authToken;}
          return json(res,{publicUrl:state.config.publicUrl,hasToken:!!state.config.authToken,seq:state.seq,tunnelStatus:state.tunnelStatus});
        }
        if(p==='/bridge/events'){
          const after=Number(u.searchParams.get('after')),client=u.searchParams.get('client');
          if(after<0||!online())state.activeClient=client;
          state.lastPoll=Date.now();const poll={res,after,client,at:Date.now()};
          if(after<0||after>state.seq||client!==state.activeClient||state.events.some(e=>e.seq>after))return answer(poll);
          state.pollers.add(poll);res.on('close',()=>state.pollers.delete(poll));return;
        }
        if(p==='/bridge/audio'){const v=JSON.parse((await body(req)).toString());const id=crypto.randomBytes(24).toString('hex');state.audio.set(id,{bytes:Buffer.from(v.data,'base64'),at:Date.now()});while(state.audio.size>300)state.audio.delete(state.audio.keys().next().value);return json(res,{id});}
        if(p==='/bridge/reply'){const v=JSON.parse((await body(req)).toString());const h=state.holds.get(v.callSid);if(h){xml(h.res,v.twiml);state.holds.delete(v.callSid);}else state.replies.set(v.callSid,{xml:v.twiml,at:Date.now()});return json(res,{ok:true});}
        if(p==='/proxy'||p==='/provider'){
          const settings=getSettings();const allowed=new Set(fixedHosts);
          for(const raw of [settings.crm?.url,settings.whatsapp?.webhookUrl]){try{allowed.add(new URL(raw).hostname);}catch{}}
          const rawBody=await body(req),v=p==='/proxy'?JSON.parse(rawBody.toString()):null;
          const target=await validTarget(v?v.url:u.searchParams.get('url'),allowed);
          const method=v?v.method||'POST':req.headers['x-provider-method']||'POST';
          const headers=v?v.headers||{}:JSON.parse(req.headers['x-provider-headers']||'{}');
          delete headers.host;delete headers.cookie;delete headers['anthropic-dangerous-direct-browser-access'];
          const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
          res.on('close',()=>abort.abort());
          try {
            const upstream=await fetch(target,{method,headers,body:['GET','HEAD'].includes(method)?undefined:v?v.body:rawBody,signal:abort.signal,redirect:'error'});
            if(v){const text=await upstream.text();return json(res,{status:upstream.status,body:text});}
            res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')||'application/json','cache-control':'no-store','retry-after':upstream.headers.get('retry-after')||''});
            if(upstream.body)await new Promise((resolve,reject)=>{const stream=Readable.fromWeb(upstream.body);stream.on('error',reject);res.on('finish',resolve);res.on('close',resolve);stream.pipe(res);});else res.end();
          }finally{clearTimeout(timer);}return;
        }
        return send(res,404,'text/plain','Not found');
      }
      if(req.method!=='GET')return send(res,405,'text/plain','GET required');
      const relative=p==='/'?'index.html':p.slice(1), file=path.resolve(root,relative);
      if(!file.startsWith(path.resolve(root)+path.sep)||!/^\.(html|js|css|svg|ico|png|pdf|wasm|bin|glb|gltf)$/.test(path.extname(file))||!fs.existsSync(file))return send(res,404,'text/plain','Not found');
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.pdf':'application/pdf','.png':'image/png'};
      Object.assign(mime,{'.wasm':'application/wasm','.bin':'application/octet-stream','.glb':'model/gltf-binary','.gltf':'model/gltf+json'});
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; media-src 'self' data: blob:; connect-src 'self' https: data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      send(res,200,mime[path.extname(file)],fs.readFileSync(file));
    } catch(e) { if(!res.headersSent)json(res,{error:{message:e.name==='AbortError'?'The provider timed out. Please retry.':e.message}},502);else res.destroy(); }
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const timer=setInterval(()=>{
    const now=Date.now();state.events=state.events.filter(e=>now-e.at<120000);
    for(const p of state.pollers)if(now-p.at>20000)answer(p);
    for(const [sid,h]of state.holds)if(now-h.at>11000){xml(h.res,online()?waitXml:offlineXml);state.holds.delete(sid);}
    for(const [sid,v]of state.replies)if(now-v.at>120000)state.replies.delete(sid);
    for(const [id,v]of state.audio)if(now-v.at>3600000)state.audio.delete(id);
  },250);timer.unref();
  return {state,port:server.address().port,close(){clearInterval(timer);server.closeAllConnections();server.close();}};
}
module.exports={createBridge,signed,privateIP};
