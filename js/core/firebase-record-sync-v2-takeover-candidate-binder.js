import {doc,getDocFromServer,runTransaction,serverTimestamp} from 'firebase/firestore';
import {
 RECORD_SYNC_V2_TAKEOVER_CANDIDATE_CONTROL_PATH,
 RECORD_SYNC_V2_TAKEOVER_CANDIDATE_HEAD_PATH,
 createFirebaseRecordSyncV2TakeoverCandidateAdapter
} from './firebase-record-sync-v2-takeover-candidate-adapter.js';
import {
 assertRecordSyncV2TrustedCutoverCurrentUser,
 recordSyncV2FirebaseServiceProject,
 resolveRecordSyncV2TrustedCutoverOperator,
 resolveRecordSyncV2TrustedCutoverOperatorIdentity
} from './firebase-record-sync-v2-trusted-cutover-operator.js';

export const RECORD_SYNC_V2_TAKEOVER_CANDIDATE_BINDER_SCOPE='real-modular-firestore-server-read-fresh-auth-claim-trusted-candidate-only-not-active-or-runtime-authority';

const uid=value=>typeof value==='string'&&value===value.trim()&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
function exact(value,fields,label){if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' must be plain object');const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid; cache read injection is forbidden');const result={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' accessor invalid');result[key]=descriptor.value}return result}
function dataField(value,key,label){if(!value||typeof value!=='object')throw new Error(label+' invalid');const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');return descriptor.value}
function assertBinderProject(firestore,auth,expectedProjectId){const firestoreProject=recordSyncV2FirebaseServiceProject(firestore,'Firestore'),authProject=recordSyncV2FirebaseServiceProject(auth,'Auth');if(firestoreProject.app!==authProject.app||firestoreProject.projectId!==expectedProjectId||authProject.projectId!==expectedProjectId)throw new Error('V2 takeover candidate binder requires same Firebase app and exact expected project');if(expectedProjectId==='danbridge-d8877-staging')return;if(expectedProjectId!=='danbridge-rules-test'||!globalThis.process?.env?.FIRESTORE_EMULATOR_HOST||!globalThis.process?.env?.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('V2 takeover candidate binder non-production project requires explicit dual Auth+Firestore Emulator hosts')}
export const resolveRecordSyncV2TakeoverCandidateTrustedUser=resolveRecordSyncV2TrustedCutoverOperator;

export function createFirebaseRecordSyncV2TakeoverCandidateBinder(input){
 const {firestore,auth,expectedProjectId}=exact(input,['firestore','auth','expectedProjectId'],'V2 takeover candidate binder config');
 if(!uid(expectedProjectId))throw new Error('V2 takeover candidate binder expected project invalid');
 assertBinderProject(firestore,auth,expectedProjectId);
 return Object.freeze({
  scope:RECORD_SYNC_V2_TAKEOVER_CANDIDATE_BINDER_SCOPE,
  async execute(rawInput){
   const plan=exact(rawInput,['plan','expected'],'V2 takeover candidate binder execute input').plan,targetV2Epoch=dataField(plan,'targetV2Epoch','V2 takeover candidate branded plan');
   if(!uid(targetV2Epoch))throw new Error('V2 takeover candidate binder target epoch invalid');
   const allowedPaths=new Set([RECORD_SYNC_V2_TAKEOVER_CANDIDATE_CONTROL_PATH(targetV2Epoch),RECORD_SYNC_V2_TAKEOVER_CANDIDATE_HEAD_PATH(targetV2Epoch)]),reference=path=>{if(!allowedPaths.has(path))throw new Error('V2 takeover candidate binder path outside exact current plan pair');return doc(firestore,...path.split('/'))};
   const identity=await resolveRecordSyncV2TrustedCutoverOperatorIdentity(auth,expectedProjectId);
   assertRecordSyncV2TrustedCutoverCurrentUser(auth,identity.currentUser,identity.actor.uid,identity.actor.email,'V2 takeover candidate auth changed immediately before transaction');
   const adapter=createFirebaseRecordSyncV2TakeoverCandidateAdapter({environment:'staging',role:'owner',actor:identity.actor,serverTimestamp,getDocumentFromServer:path=>getDocFromServer(reference(path)),runTransaction:callback=>runTransaction(firestore,transaction=>callback({get:path=>transaction.get(reference(path)),set:(path,payload)=>transaction.set(reference(path),payload,{merge:false})}))});
   let result;
   try{result=await adapter.execute(rawInput)}
   catch(error){try{assertRecordSyncV2TrustedCutoverCurrentUser(auth,identity.currentUser,identity.actor.uid,identity.actor.email,'V2 takeover candidate auth changed during transaction; commit outcome requires exact replay')}catch(race){race.cause=error;throw race}throw error}
   assertRecordSyncV2TrustedCutoverCurrentUser(auth,identity.currentUser,identity.actor.uid,identity.actor.email,'V2 takeover candidate auth changed after transaction; response-loss exact replay required');
   return result;
  }
 });
}
