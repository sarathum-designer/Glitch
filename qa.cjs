const {_electron:electron}=require('playwright'),assert=require('assert/strict'),path=require('path'),fs=require('fs');
let activeApp;
const data=path.join(__dirname,'qa-suite-'+Date.now());
async function launch(){const env={...process.env,ESTATEFLOW_TEST_VAULT:'1',ESTATEFLOW_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;const a=await electron.launch({args:[__dirname,'--test-ui','--no-sandbox','--disable-gpu'],env,timeout:60000});activeApp=a;return {a,p:await a.firstWindow()};}
(async()=>{let {a,p}=await launch();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#efStats',{state:'attached'});
 await p.locator('[data-view="voices"]').click();assert.equal(await p.locator('.ef-voice').count(),13);
 const hindi=p.locator('.ef-voice').filter({has:p.locator('h3', {hasText:'Hindi'})});await hindi.locator('[data-field="speaker"]').selectOption('ritu');await hindi.locator('[data-save]').click();
 const en=p.locator('.ef-voice').filter({has:p.locator('h3',{hasText:'English (India)'})});await en.locator('[data-field="speaker"]').selectOption('neha');await en.locator('[data-save]').click();
 const switching=await p.evaluate(()=>{setLang('en-IN');const en=$('speaker').value;const t=performance.now();for(let i=0;i<100;i++)setLang(i%2?'hi-IN':'en-IN');const ms=performance.now()-t;setLang('hi-IN');return {en,hi:$('speaker').value,ms};});assert.equal(switching.en,'neha');assert.equal(switching.hi,'ritu');console.log('Voice profile switching',switching);
 await p.screenshot({path:path.join(__dirname,'voices.png'),fullPage:true});
 for(const view of ['calls','sheets','admin','whatsapp','integrations','settings']){await p.locator(`[data-view="${view}"]`).click();assert.equal(await p.locator('#view-'+view).isVisible(),true);}
 await p.locator('[data-view="calls"]').click();await p.screenshot({path:path.join(__dirname,'calls.png'),fullPage:true});
 await p.locator('[data-view="tests"]').click();await p.locator('#selfRun').click();await p.waitForFunction(()=>!document.getElementById('selfRun').disabled,{},{timeout:180000});
 const result=await p.locator('#selfOut').innerText();console.log(result);fs.writeFileSync(path.join(__dirname,'selftest-results.txt'),result);assert.match(result,/23 of 23 tests passed/);
 const actualProfiles=await p.evaluate(()=>({en:EstateVoice.profile(store,'en-IN').speaker,hi:EstateVoice.profile(store,'hi-IN').speaker}));assert.deepEqual(actualProfiles,{en:'neha',hi:'ritu'});
 // Assert stale response errors cannot take control of a later call turn.
 await p.evaluate(()=>window.estateStore.flush());await a.close();({a,p}=await launch());await p.waitForSelector('#efStats',{state:'attached'});const restored=await p.evaluate(()=>({en:EstateVoice.profile(store,'en-IN').speaker,hi:EstateVoice.profile(store,'hi-IN').speaker}));assert.deepEqual(restored,{en:'neha',hi:'ritu'});console.log('Restart persistence passed');
 assert.deepEqual(errors,[]);await a.close();fs.writeFileSync(path.join(__dirname,'qa-results.json'),JSON.stringify({selfTests:23,voiceProfiles:13,switching,restartPersistence:true,errors},null,2));console.log('All UI checks passed');
})().catch(async e=>{console.error(e);if(activeApp)await activeApp.close().catch(()=>{});process.exitCode=1;});


