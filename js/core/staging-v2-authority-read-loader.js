import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {normalizeStagingV2FirestoreValue} from './staging-v2-active-record-browser-bridge.js';
import {buildStagingV2AuthorityReadModel} from './staging-v2-authority-read-model.js?v=20.26.211';

export const STAGING_V2_AUTHORITY_READ_LOADER_SCOPE='staging-only-fresh-server-h1-baseline-dense-ledger-current-daily-double-head-read-loader';
export const STAGING_V2_AUTHORITY_READ_LOADER_MAX_TOTAL_ROWS=50000;

const PROJECT_ID='danbridge-d8877-staging';
const token=value=>typeof value==='string'&&value===value.trim()&&/^[A-Za-z0-9_.:-]{8,128}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

function exact(value,fields,label){
 if(!plain(value))throw new Error(label+' must be plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');
 const out={};
 for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own data field');out[key]=descriptor.value}
 return out;
}

function rows(value,label){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1)throw new Error(label+' must be dense array');
 return value.map((_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+' row invalid');const row=exact(descriptor.value,['id','data'],label+' '+index);if(typeof row.id!=='string'||row.id.length<1||!plain(row.data))throw new Error(label+' row identity invalid');return{id:row.id,data:normalizeStagingV2FirestoreValue(row.data)}});
}

const baselineManifestPath=epoch=>`stagingActiveRecordV2Baselines/danbridge/epochs/${epoch}/artifacts/manifest`;
const baselineCollectionPath=(epoch,name)=>`stagingActiveRecordV2Baselines/danbridge/epochs/${epoch}/collections/${name}/records`;
const headPath=epoch=>`stagingActiveRecordV2Heads/danbridge/epochs/${epoch}`;
const ledgerCollectionPath=epoch=>`stagingActiveRecordV2SaveCommits/danbridge/epochs/${epoch}/saves`;
const dailyCollectionPath=(epoch,name)=>`stagingActiveRecordV2Records/danbridge/epochs/${epoch}/collections/${name}/records`;
const auditAppendCollectionPath=epoch=>`stagingActiveRecordV2AuditAppends/danbridge/epochs/${epoch}/records`;

function canonicalBaseline(collection,value){
 return [...value].sort((left,right)=>{
  if(collection!=='changes')return left.id<right.id?-1:left.id>right.id?1:0;
  const a=left.data.recordIndex,b=right.data.recordIndex;
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b))return left.id<right.id?-1:left.id>right.id?1:0;
  return a-b|| (left.id<right.id?-1:left.id>right.id?1:0);
 });
}

export function createStagingV2AuthorityReadLoader(raw){
 const input=exact(raw,['expectedProjectId','getDocumentFromServer','getCollectionFromServer'],'staging V2 authority read loader config');
 if(input.expectedProjectId!==PROJECT_ID||typeof input.getDocumentFromServer!=='function'||typeof input.getCollectionFromServer!=='function')throw new Error('staging V2 authority read loader boundary blocked');
 const getDocument=async(path,label)=>{const value=await input.getDocumentFromServer(path);if(value===null||value===undefined)throw new Error(label+' missing');if(!plain(value))throw new Error(label+' invalid');return normalizeStagingV2FirestoreValue(value)};
 const getCollection=async(path,label)=>rows(await input.getCollectionFromServer(path),label);
 return Object.freeze({
  scope:STAGING_V2_AUTHORITY_READ_LOADER_SCOPE,
  async load(rawRequest){
   const request=exact(rawRequest,['activationEpoch'],'staging V2 authority read loader request'),epoch=request.activationEpoch;
   if(!token(epoch))throw new Error('staging V2 authority read loader epoch invalid');
   const baselineManifest=await getDocument(baselineManifestPath(epoch),'staging V2 baseline manifest');
   const baselineEntries=await Promise.all(FULL_RECORD_COLLECTIONS.map(async collection=>[collection,canonicalBaseline(collection,await getCollection(baselineCollectionPath(epoch,collection),'staging V2 baseline '+collection))]));
   const baselineRecordsByCollection=Object.fromEntries(baselineEntries);
   const headBefore=await getDocument(headPath(epoch),'staging V2 head before');
   const [ledgers,dailyEntries,auditRecords]=await Promise.all([
    getCollection(ledgerCollectionPath(epoch),'staging V2 ledgers'),
    Promise.all(FULL_RECORD_COLLECTIONS.map(async collection=>[collection,await getCollection(dailyCollectionPath(epoch,collection),'staging V2 daily '+collection)])),
    getCollection(auditAppendCollectionPath(epoch),'staging V2 audit appends'),
   ]);
   const dailyRecordsByCollection=Object.fromEntries(dailyEntries),totalRows=ledgers.length+auditRecords.length+FULL_RECORD_COLLECTIONS.reduce((sum,collection)=>sum+baselineRecordsByCollection[collection].length+dailyRecordsByCollection[collection].length,0);
   if(totalRows>STAGING_V2_AUTHORITY_READ_LOADER_MAX_TOTAL_ROWS)throw new Error('staging V2 authority read loader row budget exceeded');
   const headAfter=await getDocument(headPath(epoch),'staging V2 head after');
   return buildStagingV2AuthorityReadModel({baselineManifest,baselineRecordsByCollection,headBefore,headAfter,ledgers,dailyRecordsByCollection,auditRecords});
  },
 });
}
