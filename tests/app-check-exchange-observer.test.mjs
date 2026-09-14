import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppCheckExchangeObserver,installAppCheckExchangeObserver} from '../js/core/app-check-exchange-observer.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const endpoint='https://content-firebaseappcheck.googleapis.com/v1/projects/project-id/apps/app-id:exchangeRecaptchaEnterpriseToken?key=PRIVATE_KEY';
function setup(response,options={}){
 const evidence=[],calls=[];const observer=createAppCheckExchangeObserver({projectId:'project-id',appId:'app-id',fetch:async(...args)=>{calls.push(args);return response},onEvidence:e=>evidence.push(e),...options});
 return {observer,evidence,calls};
}
test('captures first 403 classification without changing response, tokens or request',async()=>{
 const body={error:{status:'PERMISSION_DENIED',message:'App attestation failed. PRIVATE_TOKEN',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'API_KEY_HTTP_REFERRER_BLOCKED',metadata:{secret:'PRIVATE_METADATA'}}]}};
 const response=Response.json(body,{status:403}),{observer,evidence,calls}=setup(response,{context:()=>({visibility:'hidden',online:true})});
 const init={method:'POST',body:'PRIVATE_RECAPTCHA',headers:{Authorization:'PRIVATE_AUTH'},signal:new AbortController().signal};
 assert.strictEqual(await observer.fetch(endpoint,init),response);assert.strictEqual(calls[0][1],init);assert.equal(calls.length,1);
 assert.deepEqual(await response.json(),body);await observer.settled();
 assert.equal(evidence.length,1);assert.equal(evidence[0].category,'attestation-rejected');assert.equal(evidence[0].httpStatus,403);
 assert.equal(evidence[0].visibility,'hidden');assert.deepEqual(evidence[0].reasons,['API_KEY_HTTP_REFERRER_BLOCKED']);assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE|metadata|Authorization/);
});
test('does not observe successes, other projects, other services or spoofed hosts',async()=>{
 for(const url of [endpoint.replace('project-id','another'),endpoint.replace('content-firebaseappcheck.googleapis.com','content-firebaseappcheck.googleapis.com.evil.test'),'https://firestore.googleapis.com/v1/projects/project-id',endpoint.replace('exchangeRecaptchaEnterpriseToken','exchangeDebugToken')]){
  const {observer,evidence,calls}=setup(Response.json({error:{message:'App attestation failed.'}},{status:403}));await observer.fetch(url);await observer.settled();assert.equal(evidence.length,0);assert.equal(calls.length,1);
 }
 const {observer,evidence}=setup(Response.json({token:'PRIVATE_VALID_TOKEN'}));await observer.fetch(endpoint);await observer.settled();assert.equal(evidence.length,0);
});
test('network rejection remains the exact original error; no retry or fabricated HTTP rejection',async()=>{
 const original=Error('network'),{observer,evidence}=setup(null,{fetch:async()=>{throw original}});
 await assert.rejects(observer.fetch(endpoint),e=>e===original);await observer.settled();assert.equal(evidence.length,0);
});
test('malformed or oversized response and throwing evidence consumer cannot break SDK result',async()=>{
 for(const body of ['not json','x'.repeat(20000)]){
  const response=new Response(body,{status:403}),{observer}=setup(response,{onEvidence:()=>{throw Error('local report unavailable')}});
  assert.strictEqual(await observer.fetch(endpoint),response);await observer.settled();assert.equal(await response.text(),body);
 }
});
test('concurrent failures remain independent and are never replayed',async()=>{
 const evidence=[];let calls=0;const observer=createAppCheckExchangeObserver({projectId:'project-id',appId:'app-id',fetch:async()=>{calls++;return Response.json({error:{status:'PERMISSION_DENIED',message:'App attestation failed.'}},{status:403})},onEvidence:e=>evidence.push(e)});
 await Promise.all(Array.from({length:4},()=>observer.fetch(endpoint)));await observer.settled();assert.equal(calls,4);assert.equal(evidence.length,4);
});
test('diagnostic timeout never delays response or leaves its cloned reader waiting',async()=>{
 let stop;const timers=[];let cancelled=false;
 const original={ok:false,status:403,clone:()=>({body:{getReader:()=>({read:()=>new Promise(r=>{stop=r}),cancel:async()=>{cancelled=true;stop({done:true})}})}})};
 const {observer,evidence}=setup(original,{schedule:fn=>{timers.push(fn);return 1},cancel:()=>{}});
 assert.strictEqual(await observer.fetch(endpoint),original);assert.equal(evidence.length,0);timers[0]();await observer.settled();assert.equal(cancelled,true);assert.equal(evidence[0].category,'unclassified');
});
test('installation retains only eight sanitized records and preserves bound native fetch receiver',async()=>{
 const writes=[],logs=[];
 const target={fetch:async function(){assert.strictEqual(this,target);return Response.json({error:{message:'PRIVATE_TOKEN',status:'PERMISSION_DENIED'}},{status:403})},document:{visibilityState:'visible'},navigator:{onLine:true},sessionStorage:{setItem:(...args)=>writes.push(args)},console:{warn:(...args)=>logs.push(args)}};
 const observer=installAppCheckExchangeObserver({target,projectId:'project-id',appId:'app-id'});
 for(let i=0;i<10;i++){await target.fetch(endpoint);await observer.settled()}
 assert.equal(JSON.parse(writes.at(-1)[1]).length,8);assert.doesNotMatch(JSON.stringify(writes)+JSON.stringify(logs),/PRIVATE|recaptcha_enterprise_token/);
});
test('observer is installed before either provider and does not disable security or auto refresh',async()=>{
 const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
 assert.ok(source.indexOf('installAppCheckExchangeObserver({')<source.indexOf("const stagingV2AppCheck="));
 assert.match(source,/stagingV2AppCheck=.*isTokenAutoRefreshEnabled:true/);
 assert.match(source,/productionAppCheck=.*isTokenAutoRefreshEnabled:true/);
});
test('unrelated requests preserve the original promise and never read diagnostic clock',()=>{
 const promise=Promise.resolve(new Response('ok'));
 const observer=createAppCheckExchangeObserver({fetch:()=>promise,projectId:'project-id',appId:'app-id',now:()=>{throw Error('must not run')}});
 assert.strictEqual(observer.fetch('https://firestore.googleapis.com/'),promise);
});
test('unavailable diagnostic clock or locked fetch cannot prevent application operation',async()=>{
 const response=Response.json({error:{}},{status:403});
 const {observer}=setup(response,{now:()=>{throw Error('clock unavailable')}});
 assert.strictEqual(await observer.fetch(endpoint),response);
 const native=async()=>response,target=Object.freeze({fetch:native});
 assert.equal(installAppCheckExchangeObserver({target,projectId:'project-id',appId:'app-id'}),null);
 assert.strictEqual(target.fetch,native);
});
test('installed SDK preserves first 403 evidence, then enforces its original one-day backoff without another exchange',async()=>{
 // Execute the installed SDK implementation, not a reimplementation of its
 // retry policy. Google attestation and HTTP are mocked; this is not live proof.
 const sdk=await readFile(new URL('../node_modules/@firebase/app-check/dist/esm/index.esm.js',import.meta.url),'utf8');
 const part=(start,end)=>{const a=sdk.indexOf(start),b=sdk.indexOf(end,a);assert.ok(a>=0&&b>a);return sdk.slice(a,b)};
 const evidence=[];let exchanges=0;
 const observer=createAppCheckExchangeObserver({projectId:'project-id',appId:'app-id',onEvidence:r=>evidence.push(r),fetch:async()=>{exchanges++;return Response.json({error:{status:'PERMISSION_DENIED',message:'App attestation failed.'}},{status:403})}});
 const clock=1_000_000,context={fetch:observer.fetch,Date:{now:()=>clock},ONE_DAY:86400000,
  getToken$1:async()=>'FAKE_TEST_RECAPTCHA',getStateReference:()=>({reCAPTCHAState:{succeeded:true}}),
  getExchangeRecaptchaEnterpriseTokenRequest:()=>({url:endpoint,body:{}}),getDurationString:String,
  ERROR_FACTORY:{create:(code,data)=>Object.assign(new Error(code),{code:'appCheck/'+code,customData:data})},
  calculateBackoffMillis:()=>{throw Error('403 must not use generic retry')}};
 const Provider=vm.runInNewContext(part('async function exchangeToken(', 'function getExchangeRecaptchaV3TokenRequest(')+
  part('class ReCaptchaEnterpriseProvider {','class CustomProvider {')+
  part('function setBackoff(', '\n/**\n * @license')+'\nReCaptchaEnterpriseProvider',context);
 const provider=new Provider('TEST_SITE_KEY');provider._app={};provider._heartbeatServiceProvider={getImmediate:()=>null};
 await assert.rejects(provider.getToken(true),e=>e.code==='appCheck/initial-throttle'&&e.customData.httpStatus===403);
 await observer.settled();assert.equal(exchanges,1);assert.equal(evidence[0].category,'attestation-rejected');
 assert.equal(provider._throttleData.allowRequestsAfter,clock+86400000);
 await assert.rejects(provider.getToken(true),e=>e.code==='appCheck/throttled');
 assert.equal(exchanges,1);assert.equal(evidence.length,1);
});

test('installed SDK recovers from repeated 401 only after its backoff, using fresh attestations and unchanged responses',async()=>{
 const sdk=await readFile(new URL('../node_modules/@firebase/app-check/dist/esm/index.esm.js',import.meta.url),'utf8');
 const part=(start,end)=>{const a=sdk.indexOf(start),b=sdk.indexOf(end,a);assert.ok(a>=0&&b>a);return sdk.slice(a,b)};
 let clock=1_000_000,attempt=0,attestations=0;const evidence=[],requests=[];
 const observer=createAppCheckExchangeObserver({projectId:'project-id',appId:'app-id',now:()=>clock,onEvidence:r=>evidence.push(r),fetch:async(url,init)=>{
  requests.push(JSON.parse(init.body));attempt++;
  return attempt<=2?Response.json({error:{status:'UNAUTHENTICATED',message:'Unclassified test rejection'}},{status:401}):Response.json({token:'FAKE_VALID_TEST_TOKEN',ttl:'3600s'});
 }});
 const context={fetch:observer.fetch,Date:{now:()=>clock},ONE_DAY:86400000,
  getToken$1:async()=>`FAKE_TEST_ATTESTATION_${++attestations}`,getStateReference:()=>({reCAPTCHAState:{succeeded:true}}),
  getExchangeRecaptchaEnterpriseTokenRequest:(_app,token)=>({url:endpoint,body:{recaptcha_enterprise_token:token}}),getDurationString:String,
  ERROR_FACTORY:{create:(code,data)=>Object.assign(new Error(code),{code:'appCheck/'+code,customData:data})},
  calculateBackoffMillis:count=>1000*2**count};
 const Provider=vm.runInNewContext(part('async function exchangeToken(', 'function getExchangeRecaptchaV3TokenRequest(')+
  part('class ReCaptchaEnterpriseProvider {','class CustomProvider {')+part('function setBackoff(', '\n/**\n * @license')+'\nReCaptchaEnterpriseProvider',context);
 const provider=new Provider('TEST_SITE_KEY');provider._app={};provider._heartbeatServiceProvider={getImmediate:()=>null};
 for(const delay of [1000,2000]){
  await assert.rejects(provider.getToken(true),e=>e.code==='appCheck/initial-throttle'&&e.customData.httpStatus===401);
  const before=attempt;clock+=delay;
  // The SDK deliberately rejects at the exact boundary as well.
  await assert.rejects(provider.getToken(true),e=>e.code==='appCheck/throttled');
  assert.equal(attempt,before);assert.equal(attestations,before);clock++;
 }
 const result=await provider.getToken(true);await observer.settled();
 assert.equal(result.token,'FAKE_VALID_TEST_TOKEN');assert.equal(provider._throttleData,null);
 assert.equal(attempt,3);assert.equal(new Set(requests.map(r=>r.recaptcha_enterprise_token)).size,3);
 assert.ok(requests.every(r=>r.limited_use===true));assert.equal(evidence.length,2);
 assert.ok(evidence.every(e=>e.httpStatus===401&&e.errorStatus==='UNAUTHENTICATED'));
 assert.doesNotMatch(JSON.stringify(evidence),/FAKE_TEST|FAKE_VALID|recaptcha_enterprise_token/);
});
