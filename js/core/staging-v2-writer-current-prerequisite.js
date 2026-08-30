import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const STAGING_V2_WRITER_CURRENT_PREREQUISITE_SCOPE='one-shot-read-authoritative-c-s-manifest-then-create-or-replay-exact-w0-before-supervisor-v1';

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function exact(value,fields,label){if(!plain(value))throw new Error(label+' must be plain object');const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');const out={};for(const key of fields){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.prototype.hasOwnProperty.call(d,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');out[key]=d.value}return out}
const count=value=>Number.isSafeInteger(value)&&value>=0;

export function createStagingV2WriterCurrentPrerequisite(raw){
 const input=exact(raw,['readiness','writerCurrent'],'staging V2 W0 prerequisite config');
 if(typeof input.readiness?.seedInput!=='function'||typeof input.writerCurrent?.execute!=='function')throw new Error('staging V2 W0 prerequisite dependencies invalid');
 let used=false;
 return Object.freeze({scope:STAGING_V2_WRITER_CURRENT_PREREQUISITE_SCOPE,async run(){
  if(used)throw new Error('staging V2 W0 prerequisite is one-shot');used=true;
  const seed=exact(await input.readiness.seedInput(),['state','input','readCount','writeCount'],'staging V2 W0 seed result');
  if(!['open-required','open-replay','hard-paused-replay'].includes(seed.state)||!count(seed.readCount)||seed.readCount!==(seed.state==='hard-paused-replay'?5:4)||seed.writeCount!==0||!plain(seed.input)||!plain(seed.input.writerCurrent))throw new Error('staging V2 W0 seed result blocked');
  if(seed.state==='hard-paused-replay'){
   const body={schema:'danbridge-staging-v2-writer-current-prerequisite-receipt-v1',scope:STAGING_V2_WRITER_CURRENT_PREREQUISITE_SCOPE,state:'complete-confirmed',transactionState:'hard-paused-replayed',activationEpoch:seed.input.writerCurrent.activationEpoch,controlHash:seed.input.writerCurrent.controlHash,readCount:seed.readCount,writeCount:0};
   return Object.freeze({...body,receiptHash:sha256Canonical(body)});
  }
  const completed=await input.writerCurrent.execute(seed.input),result=exact(completed,['state','transactionState','scope','controlHash','activationEpoch','transactionReadCount','verificationReadCount','totalReadCount','writeCount'],'staging V2 W0 completion');
  if(result.state!=='complete-confirmed'||!['created','replayed'].includes(result.transactionState)||result.controlHash!==seed.input.writerCurrent.controlHash||result.activationEpoch!==seed.input.writerCurrent.activationEpoch||result.transactionReadCount!==3||result.verificationReadCount!==1||result.totalReadCount!==4||![0,1].includes(result.writeCount))throw new Error('staging V2 W0 completion blocked');
  const body={schema:'danbridge-staging-v2-writer-current-prerequisite-receipt-v1',scope:STAGING_V2_WRITER_CURRENT_PREREQUISITE_SCOPE,state:'complete-confirmed',transactionState:result.transactionState,activationEpoch:result.activationEpoch,controlHash:result.controlHash,readCount:seed.readCount+result.totalReadCount,writeCount:result.writeCount};
  return Object.freeze({...body,receiptHash:sha256Canonical(body)});
 }})
}
