/* Desktop persistence and authenticated network transport. Loaded before the app. */
(()=>{
 const api=window.estateDesktop, boot=api?.boot();
 const cache=boot?{...boot.values}:null, pending=new Map();let timer,chain=Promise.resolve(),lastError=null;
 const status=(message,error=false)=>window.dispatchEvent(new CustomEvent('estate-save',{detail:{message,error}}));
 function flush(){clearTimeout(timer);if(!pending.size)return chain;const batch=[...pending];pending.clear();chain=chain.then(()=>api.save(batch)).then(()=>{lastError=null;status('Saved on this device');}).catch(e=>{for(const [k,v]of batch)if(!pending.has(k))pending.set(k,v);lastError=e;status('Save failed — keep Glitch open and retry',true);});return chain;}
 window.estateStore=api?{
  get:k=>cache[k]??null,
  set(k,v){cache[k]=String(v);pending.set(k,String(v));status('Saving…');clearTimeout(timer);timer=setTimeout(flush,60);},
  del(k){delete cache[k];pending.set(k,null);clearTimeout(timer);timer=setTimeout(flush,60);},
  async flush(){await flush();if(lastError)throw lastError;},
  snapshot:()=>({...cache})
 }:null;
 if(api){
  window.addEventListener('beforeunload',()=>{const result=api.flush([...Object.entries(cache).filter(([k])=>!['lq.reportState','lq.geoCache'].includes(k)),...[...pending].filter(([,v])=>v===null)]);if(!result.ok)status(result.error,true);});
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
   const u=new URL(typeof input==='string'?input:input.url,location.href),opts={...options},h=new Headers(options.headers||{});
   if(u.origin===location.origin){h.set('x-estateflow-token',boot.token);return nativeFetch(input,{...opts,headers:h});}
   if(['api.groq.com','api.sarvam.ai','api.anthropic.com'].includes(u.hostname)){
    let b=opts.body;
    if(b instanceof FormData){const r=new Response(b);b=await r.arrayBuffer();h.set('content-type',r.headers.get('content-type'));}
    return nativeFetch('/provider?url='+encodeURIComponent(u.href),{method:'POST',headers:{'x-estateflow-token':boot.token,'x-provider-method':opts.method||'GET','x-provider-headers':JSON.stringify(Object.fromEntries(h))},body:b,signal:opts.signal});
   }
   return nativeFetch(input,opts);
  };
 }
})();
