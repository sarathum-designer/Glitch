const fs=require('fs'),path=require('path');
(async()=>{
 fs.mkdirSync('resources',{recursive:true});fs.mkdirSync('app/vendor',{recursive:true});
 for(const [url,file]of [['https://github.com/cloudflare/cloudflared/releases/download/2026.9.3/cloudflared-windows-amd64.exe','resources/cloudflared.exe'],['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','app/vendor/xlsx.full.min.js']]){const r=await fetch(url);if(!r.ok)throw Error(r.status+' '+url);fs.writeFileSync(path.join(__dirname,file),Buffer.from(await r.arrayBuffer()));console.log(file+' downloaded');}
})().catch(e=>{console.error(e);process.exitCode=1;});
