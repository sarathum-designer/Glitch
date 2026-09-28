const {_electron:electron}=require('playwright'),assert=require('assert/strict'),path=require('path'),fs=require('fs');
(async()=>{const data=path.join(__dirname,'qa-scale-'+Date.now()),env={...process.env,ESTATEFLOW_TEST_VAULT:'1',ESTATEFLOW_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;let a;
 try{a=await electron.launch({args:[__dirname,'--test-ui','--no-sandbox','--disable-gpu'],env});const p=await a.firstWindow();await p.waitForSelector('#efStats',{state:'attached'});
 const r=await p.evaluate(()=>{db.customers=Array.from({length:10000},(_,i)=>({id:'test-'+i,name:'Scale buyer '+i,phone:'+9198765'+String(i).padStart(5,'0'),projectId:db.projects[0].id,stage:'Contacted',language:'hi-IN',score:50,history:[],createdAt:nowIso(),updatedAt:nowIso(),simulated:true,waStatus:'declined'}));const t=performance.now();showView('sheets');return {ms:performance.now()-t,rendered:$('sheetTable').querySelectorAll('tbody tr').length,total:sheetRows(sheetProjectId).length};});assert.equal(r.rendered,100);assert.equal(r.total,10000);console.log('Scale render',r);
 await p.locator('#sheetPager button').last().click();assert.match(await p.locator('#sheetPager').innerText(),/101–200/);
 await p.locator('#sheetSearch').fill('Scale buyer 9999');await p.waitForTimeout(200);assert.equal(await p.locator('#sheetTable tbody tr').count(),1);
 await p.evaluate(()=>loadScript('vendor/xlsx.full.min.js'));assert.equal(await p.evaluate(()=>sheetExportRows(db.projects[0].id).length),10000);
 const file=path.join(data,'export.xlsx');await a.evaluate(({session},file)=>{session.defaultSession.on('will-download',(_,item)=>item.setSavePath(file));},file);
 await p.locator('#exportXlsx').click();for(let i=0;i<30&&!fs.existsSync(file);i++)await p.waitForTimeout(200);assert.ok(fs.statSync(file).size>1000);console.log('Excel export bytes',fs.statSync(file).size);
 await p.locator('[data-view="calls"]').click();await p.evaluate(()=>saveContacts(Array.from({length:10000},(_,i)=>({id:'c'+i,name:'Queued '+i,phone:'+9198765'+String(i).padStart(5,'0'),projectId:db.projects[0].id,lang:'hi-IN',state:'queued'}))));assert.equal(await p.locator('#contacts tr').count(),100);
 // Provider errors must not be interpreted as successful calls or messages.
 const providerError=await p.evaluate(async()=>{const f=window.fetch;window.fetch=async()=>new Response(JSON.stringify({error:{message:'Provider timed out'}}),{status:502});try{await viaProxy('https://api.twilio.com');return false;}catch(e){return e.message==='Provider timed out';}finally{window.fetch=f;}});assert.equal(providerError,true);
 fs.writeFileSync(path.join(__dirname,'scale-results.json'),JSON.stringify({...r,excelExportRecords:10000,contactPageSize:100,providerErrors:true},null,2));console.log('Scale, pagination and Excel export passed');
 }finally{await a?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
