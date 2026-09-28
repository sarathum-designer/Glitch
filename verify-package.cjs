const fs=require('fs'),path=require('path'),crypto=require('crypto'),asar=require('@electron/asar'),assert=require('assert/strict');
const archive='release/win-unpacked/resources/app.asar';let count=0;
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(!file.endsWith('.ps1')){const inside=asar.extractFile(archive,file);assert.equal(crypto.createHash('sha256').update(inside).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),file);count++;}}}
walk('app');walk('desktop');
assert.ok(asar.extractFile(archive,path.join('app','tests.js')).toString().includes('Demo follow-ups never reach a live provider'));
let secrets=[];for(const f of ['app/index.html','app/backend.js','app/telephony.js','app/desktop-store.js','desktop/main.cjs']){if(/sk-(?:proj-)?[A-Za-z0-9_-]{30,}|gsk_[A-Za-z0-9]{30,}/.test(fs.readFileSync(f,'utf8')))secrets.push(f);}assert.deepEqual(secrets,[]);
console.log('Packaged source integrity passed for '+count+' files; no embedded provider secrets detected.');
fs.writeFileSync('package-verification.json',JSON.stringify({filesVerified:count,embeddedProviderSecrets:0,installerBytes:fs.statSync('release/Glitch-Setup-0.3.0.exe').size},null,2));

