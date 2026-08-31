import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {createStagingV2AdminBoundary} from './firebase-staging-v2-service-account-boundary.js';
import {getFirestore} from 'firebase-admin/firestore';

const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const entryId=sequence=>String(sequence).padStart(8,'0');

function ownData(value,key,label){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+' own data field blocked');return descriptor.value}

export function createFirebaseStagingV2SupervisorJournal({app,firestore,expectedProjectId,runId}={}){
 if(!plain({app,firestore,expectedProjectId,runId})||!app||!firestore||!token(runId))throw new Error('staging V2 supervisor journal config blocked');
 const appOptions=app?.options,projectId=appOptions&&ownData(appOptions,'projectId','staging V2 supervisor app options');let nativeFirestore;
 try{nativeFirestore=getFirestore(app)}catch{throw new Error('staging V2 supervisor App/Firestore identity blocked')}
 if(projectId!==expectedProjectId||nativeFirestore!==firestore)throw new Error('staging V2 supervisor App/Firestore identity blocked');
 const collectionPath=`stagingRecordSyncV2SupervisorJournals/danbridge/runs/${runId}/entries`,boundary=createStagingV2AdminBoundary(expectedProjectId);
 return Object.freeze({
  async append(row){
   await boundary.attest();
   if(!plain(row)||!Number.isSafeInteger(row.sequence)||row.sequence<0||row.runId!==runId)throw new Error('staging V2 supervisor journal append blocked');
   const id=entryId(row.sequence),ref=firestore.collection(collectionPath).doc(id);
   await ref.create(row);
   const fresh=await ref.get(),saved=fresh?.exists===true?fresh.data():null;
   if(!plain(saved)||sha256Canonical(saved)!==sha256Canonical(row))throw new Error('staging V2 supervisor journal durable readback blocked');
  },
  async readAll(){
   await boundary.attest();
   const snapshot=await firestore.collection(collectionPath).orderBy('sequence','asc').get(),docs=Array.isArray(snapshot?.docs)?snapshot.docs:null;
   if(!docs)throw new Error('staging V2 supervisor journal query blocked');
   return docs.map((doc,index)=>{const value=doc?.data();if(doc?.id!==entryId(index)||!plain(value)||value.sequence!==index||value.runId!==runId)throw new Error('staging V2 supervisor journal inventory blocked');return value});
  },
 });
}
