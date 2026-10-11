const { app, BrowserWindow, ipcMain, safeStorage, dialog, shell, Menu, Tray, nativeImage, powerSaveBlocker, session } = require('electron');
const path=require('node:path'), fs=require('node:fs'), crypto=require('node:crypto'), {spawn}=require('node:child_process');
const {Store}=require('./database.cjs');
const {createBridge}=require('./bridge.cjs');
const {createReports}=require('./reports.cjs');
const {createGeocoder}=require('./project-services.cjs');
const {Worker}=require('node:worker_threads');
let reports,reportTimer;
let win,store,bridge,tray,tunnel,quitting=false;
const smoke=process.argv.includes('--smoke');
const testDir=process.env.ESTATEFLOW_TEST_DATA;
if(testDir)app.setPath('userData',testDir);
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{win?.show();win?.focus();});
function valid(event){if(event.sender!==win?.webContents || !event.senderFrame.url.startsWith(`http://127.0.0.1:${bridge.port}/`))throw Error('Untrusted window');}
app.whenReady().then(async()=>{
  const testVault=!app.isPackaged && process.env.ESTATEFLOW_TEST_VAULT==='1' && !!testDir;
  if(!testVault && !safeStorage.isEncryptionAvailable())throw Error('Windows credential protection is unavailable. Start Glitch normally under your Windows account.');
  let protect=s=>safeStorage.encryptString(s), unprotect=b=>safeStorage.decryptString(b);
  if(testVault){
    const keyFile=path.join(testDir,'test-vault-key');fs.mkdirSync(testDir,{recursive:true});
    const key=fs.existsSync(keyFile)?fs.readFileSync(keyFile):crypto.randomBytes(32);fs.writeFileSync(keyFile,key);
    protect=s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),b=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]);};
    unprotect=b=>{const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');};
  }
  store=new Store(app.getPath('userData'),protect,unprotect);
  const modelRoot=path.join(app.getPath('userData'),'models'),geocode=createGeocoder(store);
  ipcMain.handle('glitch:geocode',(e,query)=>{valid(e);return geocode(query);});
  ipcMain.handle('glitch:import-model',async e=>{valid(e);const picked=await dialog.showOpenDialog(win,{title:'Import building model',properties:['openFile'],filters:[{name:'Building model',extensions:['glb','gltf','obj']}]});if(picked.canceled)return null;return new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'model-worker.cjs'),{workerData:{file:picked.filePaths[0],root:modelRoot}});w.once('message',m=>m.error?reject(Error(m.error)):resolve(m.value));w.once('error',reject);w.once('exit',code=>{if(code)reject(Error('Model import stopped.'));});});});
  reports=createReports({store,dir:path.join(app.getPath('userData'),'reports')});
  reportTimer=setInterval(()=>reports.tick().catch(()=>{}),30000);
  ipcMain.handle('glitch:report',async(e,options)=>{valid(e);if(!options||typeof options!=='object')throw Error('Invalid report request');return reports.run({date:options.date,projectId:options.projectId||'',send:options.send===true});});
  ipcMain.handle('glitch:report-folder',e=>{valid(e);const folder=reports.folder();fs.mkdirSync(folder,{recursive:true});return shell.openPath(folder);});
  ipcMain.handle('glitch:report-status',e=>{valid(e);return reports.status();});
  const token=crypto.randomBytes(32).toString('hex');
  let integrationSettings={};
  const updateSettings=changes=>{const row=changes.find(([key])=>key==='lq.db');if(row){try{integrationSettings=JSON.parse(row[1]||'{}').settings||{};}catch{}}};
  updateSettings(Object.entries(store.all()));
  bridge=await createBridge({root:path.join(__dirname,'../app'),modelRoot,token,getSettings:()=>integrationSettings});
  const origin=`http://127.0.0.1:${bridge.port}`;
  ipcMain.on('estate:boot',(e)=>{valid(e);e.returnValue={values:store.all(),token,version:app.getVersion()};});
  ipcMain.handle('estate:save',(e,v)=>{valid(e);store.batch(v);updateSettings(v);return true;});
  ipcMain.on('estate:flush',(e,v)=>{try{valid(e);store.batch(v);updateSettings(v);e.returnValue={ok:true};}catch(err){e.returnValue={ok:false,error:err.message};}});
  ipcMain.handle('estate:backup',async e=>{valid(e);const r=await dialog.showSaveDialog(win,{defaultPath:`Glitch-${new Date().toISOString().slice(0,10)}.sqlite`,filters:[{name:'Encrypted backup (this Windows account)',extensions:['sqlite']}]});if(r.canceled)return false;store.backup(r.filePath);return true;});
  ipcMain.handle('estate:folder',e=>{valid(e);return shell.openPath(app.getPath('userData'));});
  ipcMain.handle('estate:tunnel',async e=>{
    valid(e);if(tunnel&&!tunnel.killed)return bridge.state.tunnelStatus;
    const exe=path.join(app.isPackaged?process.resourcesPath:path.join(__dirname,'../resources'),'cloudflared.exe');
    if(!fs.existsSync(exe))throw Error('Tunnel helper is missing. Set your public HTTPS address in Integrations.');
    bridge.state.tunnelStatus='Connecting';
    tunnel=spawn(exe,['tunnel','--no-autoupdate','--protocol','http2','--url',origin],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    tunnel.stderr.on('data',b=>{const m=b.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(m){bridge.state.config.publicUrl=m[0];bridge.state.tunnelStatus='Connected';}});
    tunnel.on('error',()=>{bridge.state.tunnelStatus='Connection failed';});
    tunnel.on('exit',()=>{bridge.state.tunnelStatus='Stopped';tunnel=null;});return 'Connecting';
  });
  session.defaultSession.setPermissionRequestHandler((wc,p,cb)=>cb(wc===win?.webContents&&['media','notifications','clipboard-sanitized-write'].includes(p)));
  session.defaultSession.setPermissionCheckHandler((wc,p)=>wc===win?.webContents&&['media','notifications','clipboard-sanitized-write'].includes(p));
  win=new BrowserWindow({width:1500,height:960,minWidth:1000,minHeight:700,show:!smoke&&!process.argv.includes('--test-ui'),title:'Glitch',backgroundColor:'#f4f7fa',icon:path.join(__dirname,'../app/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith(origin+'/'))e.preventDefault();});
  win.on('close',e=>{if(!quitting&&!smoke){e.preventDefault();win.hide();}});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Glitch',submenu:[{label:'Show workspace',click:()=>win.show()},{label:'Quit Glitch',click:()=>{quitting=true;app.quit();}}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../app/icon.ico')));tray.setToolTip('Glitch — calling workspace');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Glitch',click:()=>win.show()},{label:'Quit',click:()=>{quitting=true;app.quit();}}]));tray.on('double-click',()=>win.show());
  powerSaveBlocker.start('prevent-app-suspension');
  await win.loadURL(origin);
  if(smoke){await new Promise(r=>setTimeout(r,3000));const info=await win.webContents.executeJavaScript(`({title:document.title,desktop:!!window.estateDesktop,views:document.querySelectorAll('.view').length})`);console.log(JSON.stringify(info));await win.capturePage().then(i=>fs.writeFileSync(path.join(app.getPath('userData'),'screenshot.png'),i.toPNG()));quitting=true;app.quit();}
}).catch(e=>{console.error(e);if(!smoke&&!process.argv.includes('--test-ui'))dialog.showErrorBox('Glitch could not start',e.message);quitting=true;app.quit();});
app.on('before-quit',()=>{quitting=true;});
app.on('will-quit',()=>{clearInterval(reportTimer);tunnel?.kill();bridge?.close();store?.close();});
app.on('window-all-closed',()=>{if(quitting||smoke)app.quit();});


