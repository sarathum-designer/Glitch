const {parentPort,workerData}=require('node:worker_threads');
require('./project-services.cjs').importModel(workerData.file,workerData.root).then(value=>parentPort.postMessage({value})).catch(e=>parentPort.postMessage({error:e.message}));
