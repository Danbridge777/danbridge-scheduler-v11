const text=value=>typeof value==='string'&&value.length>0;

function hasPendingWork(diagnostics={}){
 return Boolean(diagnostics?.dirty||diagnostics?.queued||diagnostics?.inFlight||diagnostics?.retryPending);
}

export function decideOwnerActiveSaveIntent({nextHash,localDirtyHash='',lastUploadedHash='',diagnostics=null,applyingCloud=false}={}){
 if(!text(nextHash))throw new Error('Owner active save intent 缺少目前資料 hash');
 if(applyingCloud)return{action:'ignore-cloud-apply',queue:false,incrementMutation:false};
 if(!localDirtyHash&&text(lastUploadedHash)&&nextHash===lastUploadedHash)return{action:'noop-confirmed',queue:false,incrementMutation:false};
 if(text(localDirtyHash)&&nextHash===localDirtyHash){
  if(hasPendingWork(diagnostics))return{action:'coalesce',queue:false,incrementMutation:false};
  return{action:'recover',queue:true,incrementMutation:false};
 }
 return{action:'queue',queue:true,incrementMutation:true};
}
