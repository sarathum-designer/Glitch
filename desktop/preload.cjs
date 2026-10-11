const { contextBridge,ipcRenderer }=require('electron');
contextBridge.exposeInMainWorld('estateDesktop',{
 boot:()=>ipcRenderer.sendSync('estate:boot'),
 save:v=>ipcRenderer.invoke('estate:save',v),
 flush:v=>ipcRenderer.sendSync('estate:flush',v),
 backup:()=>ipcRenderer.invoke('estate:backup'),
 folder:()=>ipcRenderer.invoke('estate:folder'),
 tunnel:()=>ipcRenderer.invoke('estate:tunnel'),
 report:options=>ipcRenderer.invoke('glitch:report',options),
 reportFolder:()=>ipcRenderer.invoke('glitch:report-folder'),
 reportStatus:()=>ipcRenderer.invoke('glitch:report-status'),
 importModel:()=>ipcRenderer.invoke('glitch:import-model'),
 geocode:query=>ipcRenderer.invoke('glitch:geocode',query)
});
