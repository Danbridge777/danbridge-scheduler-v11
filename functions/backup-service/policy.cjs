'use strict';
const PROJECT='danbridge-d8877', DATABASE=`projects/${PROJECT}/databases/(default)`;
const BUCKET='danbridge-d8877-database-backups', RETAIN=13;
function monthAt(now){return new Date(now+8*3600000).toISOString().slice(0,7)}
function assertManifest(value){
 if(!value||value.schema!=='danbridge-monthly-export-v1'||value.database!==DATABASE||value.bucket!==BUCKET||!/^20\d\d-(0[1-9]|1[0-2])$/.test(value.month)||!['starting','running','verified'].includes(value.state))throw new Error('Invalid backup manifest');
 if(!new RegExp(`^exports/${value.month}/[a-f0-9-]{36}$`).test(value.prefix))throw new Error('Invalid export prefix');
 if(!Number.isFinite(Date.parse(value.snapshotTime)))throw new Error('Invalid snapshot time');
 if(value.operation&&!value.operation.startsWith(DATABASE+'/operations/'))throw new Error('Invalid operation scope');
 if(value.state==='verified'&&(!value.operation||!value.metadataName?.startsWith(value.prefix+'/')||!value.metadataName.endsWith('.overall_export_metadata')||!(value.objectCount>0)))throw new Error('Incomplete backup verification');
 return value;
}
function retentionPlan(manifests){
 const rows=manifests.map(assertManifest).filter(x=>x.state==='verified').sort((a,b)=>b.month.localeCompare(a.month));
 if(new Set(rows.map(x=>x.month)).size!==rows.length)throw new Error('Duplicate month manifests');
 return{keep:rows.slice(0,RETAIN),remove:rows.slice(RETAIN)};
}
function assertObject(prefix,obj){if(!obj?.name?.startsWith(prefix+'/')||!/^\d+$/.test(String(obj.generation)))throw new Error('Object outside exact backup prefix');return obj}
module.exports={PROJECT,DATABASE,BUCKET,RETAIN,monthAt,assertManifest,retentionPlan,assertObject};
