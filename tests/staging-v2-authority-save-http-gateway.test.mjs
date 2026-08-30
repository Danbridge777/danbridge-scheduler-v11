import test from 'node:test';
import assert from 'node:assert/strict';
import {
 STAGING_V2_AUTHORITY_SAVE_APP_ID,
 STAGING_V2_AUTHORITY_SAVE_ORIGINS,
 STAGING_V2_AUTHORITY_SAVE_PROJECT_ID,
 STAGING_V2_AUTHORITY_SAVE_REQUEST_SCHEMA,
 STAGING_V2_AUTHORITY_SAVE_RESPONSE_SCHEMA,
 createStagingV2AuthoritySaveHttpGateway
} from '../js/core/staging-v2-authority-save-http-gateway.js';

const origin=STAGING_V2_AUTHORITY_SAVE_ORIGINS[0],now=Date.UTC(2026,7,30,12,0,0),uid='owner-staging-12345',email='owner.staging@example.com',saveId='save-staging-v2-12345',hex=value=>String(value).repeat(64);
const payload=()=>({save:{saveId,deviceId:'device-staging-12345',actorUid:uid,actorEmail:email,createdAt:'2026-08-30T12:00:00.000Z'},changedKeys:[],baselineRecords:[],localRecords:[]});
const envelope=()=>({schema:STAGING_V2_AUTHORITY_SAVE_REQUEST_SCHEMA,projectId:STAGING_V2_AUTHORITY_SAVE_PROJECT_ID,requestId:saveId,payload:payload()});
const claims=()=>({aud:STAGING_V2_AUTHORITY_SAVE_PROJECT_ID,iss:`https://securetoken.google.com/${STAGING_V2_AUTHORITY_SAVE_PROJECT_ID}`,sub:uid,user_id:uid,email,email_verified:true,auth_time:Math.floor(now/1000)-10,exp:Math.floor(now/1000)+3600});
const completion=(transactionState='created')=>({state:'complete-confirmed',transactionState,projectId:STAGING_V2_AUTHORITY_SAVE_PROJECT_ID,activationEpoch:'activation-epoch-12345',resultHeadHash:hex('a'),commitHash:hex('b'),saveId,operationCount:1,persistedAt:'2026-08-30T12:00:01.000Z',writeCount:transactionState==='created'?4:0});
function setup(overrides={}){let calls=0,appOptions=null;const appClaims={app_id:STAGING_V2_AUTHORITY_SAVE_APP_ID,sub:STAGING_V2_AUTHORITY_SAVE_APP_ID,iss:'https://firebaseappcheck.googleapis.com/883029466360',aud:['883029466360',STAGING_V2_AUTHORITY_SAVE_PROJECT_ID],iat:Math.floor(now/1000)-10,exp:Math.floor(now/1000)+3600},cfg={expectedProjectId:STAGING_V2_AUTHORITY_SAVE_PROJECT_ID,expectedAppId:STAGING_V2_AUTHORITY_SAVE_APP_ID,allowedOrigins:[...STAGING_V2_AUTHORITY_SAVE_ORIGINS],verifyIdToken:async()=>claims(),verifyAppCheckToken:async(_token,options)=>{appOptions=options;return{appId:STAGING_V2_AUTHORITY_SAVE_APP_ID,token:appClaims,alreadyConsumed:false}},authorizeOwner:async()=>true,executeAuthoritySave:async()=>{calls++;return completion()},now:()=>now,...overrides},gateway=createStagingV2AuthoritySaveHttpGateway(cfg);return{gateway,calls:()=>calls,appOptions:()=>appOptions,appClaims}}
function raw(value=envelope(),headers={}){const rawBody=JSON.stringify(value);return{method:'POST',headers:{origin,authorization:'Bearer id-token-12345','content-type':'application/json','x-firebase-appcheck':'app-check-token-12345','x-danbridge-request-id':saveId,'content-length':String(new TextEncoder().encode(rawBody).length),...headers},rawBody}}

test('gateway只回傳最小化 staging V2 receipt，created/replayed 都是冪等成功',async()=>{for(const state of ['created','replayed']){const fixture=setup({executeAuthoritySave:async()=>completion(state)}),result=await fixture.gateway.handle(raw()),body=JSON.parse(result.body);assert.equal(result.status,200);assert.equal(result.headers['access-control-allow-origin'],origin);assert.deepEqual(Object.keys(body),['schema','state','transactionState','projectId','activationEpoch','resultHeadHash','commitHash','saveId','operationCount','persistedAt','writeCount']);assert.equal(body.schema,STAGING_V2_AUTHORITY_SAVE_RESPONSE_SCHEMA);assert.equal(body.transactionState,state);assert.equal(body.saveId,saveId);assert.equal(result.body.includes('token'),false);assert.equal(result.headers['cache-control'],'no-store');assert.equal(fixture.appOptions().consume,true)}});

test('來源、method、content type、長度與 preflight 全部 fail closed',async()=>{const {gateway,calls}=setup();let result=await gateway.handle(raw(envelope(),{origin:'https://danbridge-d8877.web.app'}));assert.equal(result.status,403);result=await gateway.handle({...raw(),method:'GET'});assert.equal(result.status,405);result=await gateway.handle(raw(envelope(),{'content-type':'text/plain'}));assert.equal(result.status,415);result=await gateway.handle(raw(envelope(),{'content-length':'1'}));assert.equal(result.status,400);assert.equal(calls(),0);const preflight=await gateway.handle({method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization, content-type, x-firebase-appcheck, x-danbridge-request-id'},rawBody:''});assert.equal(preflight.status,204);assert.equal(preflight.body,'')});

test('ID token freshness、App Check、Owner 與 payload actor 任一不符都不執行寫入',async()=>{const cases=[
 {verifyIdToken:async()=>({...claims(),auth_time:Math.floor(now/1000)-901})},
 {verifyAppCheckToken:async()=>({appId:'wrong-app',token:{},alreadyConsumed:false})},
 {verifyAppCheckToken:async()=>({appId:STAGING_V2_AUTHORITY_SAVE_APP_ID,token:{...setup().appClaims},alreadyConsumed:true})},
 {authorizeOwner:async()=>false},
 ];for(const override of cases){const fixture=setup(override),result=await fixture.gateway.handle(raw());assert.ok([401,403].includes(result.status));assert.equal(fixture.calls(),0);assert.equal(result.body.includes(email),false)}const fixture=setup(),changed=envelope();changed.payload.save.actorUid='other-owner-12345';const result=await fixture.gateway.handle(raw(changed));assert.equal(result.status,403);assert.equal(fixture.calls(),0)});

test('header/body requestId、project 與 accessor 都在驗證器前拒絕',async()=>{let verifies=0;const fixture=setup({verifyIdToken:async()=>{verifies++;return claims()}}),wrongProject=envelope();wrongProject.projectId='danbridge-d8877';assert.equal((await fixture.gateway.handle(raw(wrongProject))).status,400);assert.equal((await fixture.gateway.handle(raw(envelope(),{'x-danbridge-request-id':'different-request-12345'}))).status,400);const hostile={method:'POST',headers:{},rawBody:''};Object.defineProperty(hostile,'headers',{enumerable:true,get(){verifies++;return{}}});assert.equal((await fixture.gateway.handle(hostile)).status,400);assert.equal(verifies,0);assert.equal(fixture.calls(),0)});

test('驗證器與 Admin 內部錯誤不洩漏 exception、token 或 durable bundle',async()=>{const first=setup({verifyIdToken:async()=>{throw new Error('secret-id-token')}}),auth=await first.gateway.handle(raw());assert.equal(auth.status,401);assert.equal(auth.body.includes('secret'),false);const second=setup({executeAuthoritySave:async()=>{throw new Error('durable bundle secret path')}}),save=await second.gateway.handle(raw());assert.equal(save.status,500);assert.equal(JSON.parse(save.body).code,'SAVE_FAILED');assert.equal(save.body.includes('durable'),false)});
