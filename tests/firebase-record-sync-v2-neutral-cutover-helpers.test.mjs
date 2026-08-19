import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecordSyncV2ServerTimestamp} from '../js/core/firebase-record-sync-v2-server-timestamp.js';
import {
 assertRecordSyncV2TrustedCutoverCurrentUser,
 recordSyncV2FirebaseServiceProject,
 resolveRecordSyncV2TrustedCutoverOperator,
 resolveRecordSyncV2TrustedCutoverOperatorIdentity
} from '../js/core/firebase-record-sync-v2-trusted-cutover-operator.js';
import {normalizeRecordSyncV2TakeoverCandidateServerTimestamp} from '../js/core/firebase-record-sync-v2-takeover-candidate-adapter.js';
import {resolveRecordSyncV2TakeoverCandidateTrustedUser} from '../js/core/firebase-record-sync-v2-takeover-candidate-binder.js';

const projectId='danbridge-rules-test',claims=(overrides={})=>({sub:'owner-12345678',user_id:'owner-12345678',email:'owner@example.com',aud:projectId,iss:`https://securetoken.google.com/${projectId}`,recordSyncV2CutoverOperator:true,...overrides});
function authWith(source=claims()){const user={uid:'owner-12345678',email:'OWNER@example.com',getIdTokenResult:async force=>{assert.equal(force,true);return{claims:source}}},app={options:{projectId}},auth={app,currentUser:user};return{auth,user}}

test('neutral Timestamp helper原封保留9-digit nanos、UTC邊界與candidate舊export相容',()=>{class TimestampLike{constructor(seconds,nanoseconds){this.seconds=seconds;this.nanoseconds=nanoseconds}}for(const value of [new TimestampLike(-62135596800,0),new TimestampLike(0,123456789),new TimestampLike(253402300799,999999999)])assert.equal(normalizeRecordSyncV2ServerTimestamp(value),normalizeRecordSyncV2TakeoverCandidateServerTimestamp(value));assert.equal(normalizeRecordSyncV2ServerTimestamp(new TimestampLike(0,123456789)),'1970-01-01T00:00:00.123456789Z')});

test('neutral Timestamp拒accessor/extra/symbol/bounds且getter0',()=>{let calls=0;const accessor={nanoseconds:0};Object.defineProperty(accessor,'seconds',{enumerable:true,get(){calls++;return 0}});const nanosAccessor={seconds:0};Object.defineProperty(nanosAccessor,'nanoseconds',{enumerable:true,get(){calls++;return 0}});const symbol={seconds:0,nanoseconds:0};symbol[Symbol('x')]=true;for(const value of [accessor,nanosAccessor,symbol,{seconds:0,nanoseconds:0,extra:true},{seconds:-62135596801,nanoseconds:0},{seconds:253402300800,nanoseconds:0},{seconds:0,nanoseconds:-1},{seconds:0,nanoseconds:1000000000}])assert.throws(()=>normalizeRecordSyncV2ServerTimestamp(value),/Timestamp/);assert.equal(calls,0)});

test('neutral trusted operator強制fresh token、aud/iss/sub/user_id/email並與candidate舊export相容',async()=>{const first=authWith(),second=authWith();assert.deepEqual(await resolveRecordSyncV2TrustedCutoverOperator(first.auth),{uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}});assert.deepEqual(await resolveRecordSyncV2TakeoverCandidateTrustedUser(second.auth),{uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}});const identity=await resolveRecordSyncV2TrustedCutoverOperatorIdentity(authWith().auth,projectId);assert.equal(identity.actor.uid,'owner-12345678');assert.deepEqual(recordSyncV2FirebaseServiceProject(first.auth,'Auth'),{app:first.auth.app,projectId})});

test('token claims accessor/missing/wrong aud/iss與currentUser object/uid/email race getter0 fail closed',async()=>{let calls=0;for(const key of ['sub','user_id','email','aud','iss','recordSyncV2CutoverOperator']){const hostile=claims();Object.defineProperty(hostile,key,{enumerable:true,get(){calls++;return key}});await assert.rejects(()=>resolveRecordSyncV2TrustedCutoverOperator(authWith(hostile).auth),/data field/)}assert.equal(calls,0);for(const key of ['aud','iss']){const missing=claims();delete missing[key];await assert.rejects(()=>resolveRecordSyncV2TrustedCutoverOperator(authWith(missing).auth),/data field/);await assert.rejects(()=>resolveRecordSyncV2TrustedCutoverOperator(authWith(claims({[key]:'wrong'})).auth),/fresh canonical/)}
 for(const mutation of ['object','uid','email']){const {auth,user}=authWith();user.getIdTokenResult=async()=>{if(mutation==='object')auth.currentUser={uid:user.uid,email:user.email};if(mutation==='uid')user.uid='other-owner-12345';if(mutation==='email')user.email='other@example.com';return{claims:claims()}};await assert.rejects(()=>resolveRecordSyncV2TrustedCutoverOperator(auth),/auth changed after fresh token/)}
 const {auth,user}=authWith();assert.doesNotThrow(()=>assertRecordSyncV2TrustedCutoverCurrentUser(auth,user,'owner-12345678','owner@example.com'));user.email='mutated@example.com';assert.throws(()=>assertRecordSyncV2TrustedCutoverCurrentUser(auth,user,'owner-12345678','owner@example.com'),/auth changed/)
});

test('neutral helpers無candidate/runtime/active/write反向依賴',async()=>{const {readFile}=await import('node:fs/promises');for(const path of ['js/core/firebase-record-sync-v2-server-timestamp.js','js/core/firebase-record-sync-v2-trusted-cutover-operator.js']){const text=await readFile(new URL('../'+path,import.meta.url),'utf8');assert.doesNotMatch(text,/takeover-candidate|runtime|active-record|write-takeover/)}});
