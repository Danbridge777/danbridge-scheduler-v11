const clone = value => JSON.parse(JSON.stringify(value||{}));

const isKind = value => value==='bootstrap'||value==='confirmed';

function buildDiagnostic(task,state){
 return {kind:task?.kind||'unknown',sequence:task?.sequence||0,sourceHash:task?.sourceHash||'',state};
}

export function createActiveRoleRecordPublishQueue({publish,computeSourceHash}={}){
 if(typeof publish!=='function')throw new Error('active role publish queue 必須指定 publish callback');
 const queued=[];
 let running=false;
 let draining=false;
 let nextSequence=0;
 let latestEnqueuedConfirmedSequence=0;

 const computeHash=typeof computeSourceHash==='function'?computeSourceHash:()=>'';
 const getHash=(sourceDb)=>{
  const sourceHash=computeHash(sourceDb);
  if(typeof sourceHash!=='string'||!sourceHash.length) return '';
  return sourceHash;
 };

 function hasQueuedConfirmed(){
  return queued.some(task=>task.kind==='confirmed');
 }

 function isStaleBootstrap(task){
  return task?.kind==='bootstrap'&&(task.sequence<latestEnqueuedConfirmedSequence||hasQueuedConfirmed());
 }

 async function drainNext(){
  if(running||draining||!queued.length)return;
  draining=true;
  const task=queued.shift();
  if(!task){draining=false;return;}

  if(isStaleBootstrap(task)){
   task.resolve(buildDiagnostic(task,'skipped'));
   draining=false;
   queueMicrotask(drainNext);
   return;
  }

  running=true;
  try{
   task.state='running';
   const result=await Promise.resolve(publish(task.sourceDb,{
    kind:task.kind,
    sequence:task.sequence,
    sourceHash:task.sourceHash,
    state:task.state
   }));
   task.resolve({...buildDiagnostic(task,'published'),result});
  }catch(error){
   task.reject(error);
  }finally{
   running=false;
   draining=false;
   queueMicrotask(drainNext);
  }
 }

 function enqueue({kind='confirmed',sourceDb}={}){
  if(!isKind(kind))throw new Error('active role publish 種類必須是 bootstrap 或 confirmed');
  if(!sourceDb||typeof sourceDb!=='object'||Array.isArray(sourceDb))throw new Error('active role publish 必須有 sourceDb');
  const snapshot=clone(sourceDb);
  const task={kind,sequence:++nextSequence,sourceDb:snapshot,sourceHash:getHash(snapshot),state:'queued'};
  let resolveFn,rejectFn;
  const promise=new Promise((resolve,reject)=>{resolveFn=resolve;rejectFn=reject;});
  queued.push({...task,resolve:resolveFn,reject:rejectFn});
  if(kind==='confirmed'&&task.sequence>latestEnqueuedConfirmedSequence)latestEnqueuedConfirmedSequence=task.sequence;
  queueMicrotask(drainNext);
  return promise;
 }

 function cancelPending(){
  let canceled=0;
  while(queued.length){
   const task=queued.shift();
   task.state='cancelled';
   task.resolve(buildDiagnostic(task,'cancelled'));
   canceled+=1;
  }
  return canceled;
 }

 function closeScope(){
  return cancelPending();
 }

 return{enqueue,getState:()=>({running,queued:queued.length,nextSequence}),maxActive:1,cancelPending,closeScope};
}
