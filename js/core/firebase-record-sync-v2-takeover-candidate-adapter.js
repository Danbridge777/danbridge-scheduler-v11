import {normalizeRecordSyncV2ServerTimestamp} from './firebase-record-sync-v2-server-timestamp.js';
import {
 consumeRecordSyncV2TakeoverCandidatePlan,
 consumeRecordSyncV2TakeoverCandidateReplayVerification,
 rebuildRecordSyncV2TakeoverCandidatePersistedReplayPlan
} from './cloud-record-sync-v2-takeover-candidate.js';

export const RECORD_SYNC_V2_TAKEOVER_CANDIDATE_CONTROL_PATH=epoch=>`stagingRecordSyncV2TakeoverCandidateControls/danbridge/epochs/${epoch}`;
export const RECORD_SYNC_V2_TAKEOVER_CANDIDATE_HEAD_PATH=epoch=>`stagingActiveRecordV2Heads/danbridge/epochs/${epoch}`;
export const RECORD_SYNC_V2_TAKEOVER_CANDIDATE_ADAPTER_SCOPE='trusted-cutover-operator-atomic-candidate-pair-with-fresh-server-strict-replay-readback-not-active-or-runtime-authority';

const inputFields=['plan','expected'],expectedFields=['expectedAuthorityRootHash','expectedControlHash','expectedHeadHash','expectedTargetV2Epoch','expectedState','expectedPlanHash'];
const plain=(value,label)=>{if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' must be plain object');return value};
function exact(value,fields,label){plain(value,label);const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');const result={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be enumerable data field');result[key]=descriptor.value}return result}
const token=value=>typeof value==='string'&&value===value.trim()&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&/^[^@\s]+@[^@\s]+$/.test(value);
function valueOf(snapshot){if(snapshot==null)return null;if(typeof snapshot.exists==='function'){if(!snapshot.exists())return null;return snapshot.data()}if(typeof snapshot.exists==='boolean'&&typeof snapshot.data==='function'){if(!snapshot.exists)return null;const value=snapshot.data();return value===undefined?null:value}return snapshot}
export const normalizeRecordSyncV2TakeoverCandidateServerTimestamp=normalizeRecordSyncV2ServerTimestamp;
function normalizedDocument(value){plain(value,'persisted V2 candidate document');const result={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')throw new Error('persisted V2 candidate document symbol field invalid');const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error('persisted V2 candidate document accessor invalid');result[key]=key==='persistedAt'?normalizeRecordSyncV2TakeoverCandidateServerTimestamp(descriptor.value):descriptor.value}return result}
const replayExpected=plan=>({expectedAuthorityRootHash:plan.authorityRootHash,expectedControlHash:plan.controlHash,expectedHeadHash:plan.headHash,expectedTargetV2Epoch:plan.targetV2Epoch,expectedState:'replayed',expectedPlanHash:plan.planHash});

export function createFirebaseRecordSyncV2TakeoverCandidateAdapter({runTransaction,getDocumentFromServer,serverTimestamp,environment='staging',role,actor}={}){
 if(typeof runTransaction!=='function'||typeof getDocumentFromServer!=='function'||typeof serverTimestamp!=='function')throw new Error('V2 takeover candidate adapter requires exact getDocumentFromServer; cached getDocument is forbidden');
 const trusted={uid:actor?.uid,email:actor?.email,operator:actor?.claims?.recordSyncV2CutoverOperator===true};
 return{enabled:environment==='staging'&&role==='owner'&&trusted.operator,scope:RECORD_SYNC_V2_TAKEOVER_CANDIDATE_ADAPTER_SCOPE,async execute(rawInput){
  const input=exact(rawInput,inputFields,'V2 takeover candidate adapter input'),expected=exact(input.expected,expectedFields,'V2 takeover candidate adapter expected');
  if(environment!=='staging'||role!=='owner'||!trusted.operator||!token(trusted.uid)||!email(trusted.email))throw new Error('V2 takeover candidate adapter requires trusted staging Owner cutover claim');
  const sourcePayload=consumeRecordSyncV2TakeoverCandidatePlan(input.plan,expected),epoch=input.plan.targetV2Epoch,controlPath=RECORD_SYNC_V2_TAKEOVER_CANDIDATE_CONTROL_PATH(epoch),headPath=RECORD_SYNC_V2_TAKEOVER_CANDIDATE_HEAD_PATH(epoch);
  if(epoch!==expected.expectedTargetV2Epoch||!token(epoch))throw new Error('V2 takeover candidate target epoch invalid');
  const transactionResult=await runTransaction(async transaction=>{
   const snapshots=await Promise.all([transaction.get(controlPath),transaction.get(headPath)]),control=valueOf(snapshots[0]),head=valueOf(snapshots[1]);
   if((control===null)!==(head===null))throw new Error('V2 takeover candidate authoritative pair partial');
   if(control===null){
    if(input.plan.state!=='create-required'||!sourcePayload.candidateControl||!sourcePayload.authorityBoundHead)throw new Error('V2 takeover replay plan cannot create missing pair');
    const persistedAt=serverTimestamp(),audit={persistedAt,persistedBy:trusted.uid,persistedByEmail:trusted.email};
    transaction.set(controlPath,{...sourcePayload.candidateControl,...audit});transaction.set(headPath,{...sourcePayload.authorityBoundHead,...audit});
    return{state:'created',transactionReadCount:2,writeCount:2};
   }
   const replayPlan=rebuildRecordSyncV2TakeoverCandidatePersistedReplayPlan(input.plan,expected,{candidateControl:normalizedDocument(control),authorityBoundHead:normalizedDocument(head)});
   consumeRecordSyncV2TakeoverCandidateReplayVerification(replayPlan,replayExpected(replayPlan));
   return{state:'replayed',transactionReadCount:2,writeCount:0};
  });
  const fresh=await Promise.all([getDocumentFromServer(controlPath),getDocumentFromServer(headPath)]),control=valueOf(fresh[0]),head=valueOf(fresh[1]);if(control===null||head===null)throw new Error('V2 takeover candidate fresh server readback incomplete');
  const confirmedPlan=rebuildRecordSyncV2TakeoverCandidatePersistedReplayPlan(input.plan,expected,{candidateControl:normalizedDocument(control),authorityBoundHead:normalizedDocument(head)}),verification=consumeRecordSyncV2TakeoverCandidateReplayVerification(confirmedPlan,replayExpected(confirmedPlan));
  return Object.freeze({state:'complete-confirmed',transactionState:transactionResult.state,scope:RECORD_SYNC_V2_TAKEOVER_CANDIDATE_ADAPTER_SCOPE,targetV2Epoch:epoch,authorityRootHash:confirmedPlan.authorityRootHash,controlHash:confirmedPlan.controlHash,headHash:confirmedPlan.headHash,transactionReadCount:transactionResult.transactionReadCount,verificationReadCount:2,totalReadCount:4,writeCount:transactionResult.writeCount,replayPlan:confirmedPlan,serverAudit:verification.serverAudit});
 }};
}
