import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGoogleSignInFlow} from '../js/core/google-sign-in-flow.js';
function harness(options={}){
 const calls=[],errors=[],busy=[];
 const flow=createGoogleSignInFlow({auth:{},provider:{},hostname:'app.firebaseapp.com',authDomain:'app.firebaseapp.com',signInWithPopup:async()=>calls.push('popup'),signInWithRedirect:async()=>calls.push('redirect'),getRedirectResult:async()=>null,onError:e=>errors.push(e),onBusy:b=>busy.push(b),...options});
 return{flow,calls,errors,busy};
}
test('successful popup is single flight and releases its button',async()=>{
 let resolve;const app=harness({signInWithPopup:()=>new Promise(r=>{resolve=r})});
 const pending=app.flow.start();await app.flow.start();assert.deepEqual(app.busy,[true]);resolve();await pending;assert.deepEqual(app.busy,[true,false]);assert.equal(app.flow.getError(),'');
});
test('explicit same-origin redirect is retained',async()=>{const app=harness({preferRedirect:true});await app.flow.start();assert.deepEqual(app.calls,['redirect'])});
test('cross-origin preference does not invoke third-party-storage-dependent redirect',async()=>{const app=harness({hostname:'app.web.app',preferRedirect:true});await app.flow.start();assert.deepEqual(app.calls,['popup'])});
for(const code of ['auth/network-request-failed','auth/popup-closed-by-user','auth/cancelled-popup-request','auth/unauthorized-domain'])test(`${code} remains visible and never redirects automatically`,async()=>{
 const app=harness({signInWithPopup:async()=>{throw{code,message:'private token must not be displayed'}}});await app.flow.start();assert.deepEqual(app.calls,[]);assert.match(app.flow.getError(),new RegExp(code));assert.doesNotMatch(app.flow.getError(),/private token/);assert.deepEqual(app.busy,[true,false]);
});
test('blocked popup only falls back on identical auth host',async()=>{
 for(const hostname of ['app.firebaseapp.com','app.web.app']){const app=harness({hostname,signInWithPopup:async()=>{throw{code:'auth/popup-blocked'}}});await app.flow.start();assert.deepEqual(app.calls,hostname==='app.firebaseapp.com'?['redirect']:[]);assert.equal(Boolean(app.flow.getError()),hostname==='app.web.app')}
});
test('redirect start and callback failures are observable, null callback is normal',async()=>{
 const app=harness({preferRedirect:true,signInWithRedirect:async()=>{throw{code:'auth/network-request-failed'}},getRedirectResult:async()=>{throw{code:'auth/invalid-auth-event'}}});await app.flow.start();assert.match(app.flow.getError(),/network-request-failed/);await app.flow.completeRedirect();assert.match(app.flow.getError(),/invalid-auth-event/);
 const fresh=harness();await fresh.flow.completeRedirect();assert.deepEqual(fresh.errors,[]);
});
test('successful retry clears prior failure without stale disabled button',async()=>{
 let count=0;const app=harness({signInWithPopup:async()=>{if(!count++)throw{code:'auth/network-request-failed'}}});await app.flow.start();assert.ok(app.flow.getError());await app.flow.start();assert.equal(app.flow.getError(),'');assert.deepEqual(app.busy,[true,false,true,false]);
});
test('stalled login exposes retry; obsolete rejection cannot overwrite the newer attempt',async()=>{
 const timers=[];let rejectOld,resolveNew,count=0;
 const app=harness({schedule:(fn,ms)=>{assert.equal(ms,45000);timers.push(fn);return timers.length},cancel:()=>{},signInWithPopup:()=>++count===1?new Promise((_,reject)=>{rejectOld=reject}):new Promise(resolve=>{resolveNew=resolve})});
 const old=app.flow.start();timers[0]();assert.match(app.flow.getError(),/仍未完成/);const next=app.flow.start();assert.equal(app.flow.getError(),'');rejectOld({code:'auth/cancelled-popup-request'});await old;assert.equal(app.flow.getError(),'');assert.equal(app.busy.at(-1),true);resolveNew();await next;assert.equal(app.busy.at(-1),false);
});
test('production wiring consumes redirect errors and preserves errors across auth-card renders',async()=>{
 const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');assert.match(source,/getRedirectResult, onAuthStateChanged/);assert.match(source,/void googleSignInFlow\.completeRedirect\(\)/);assert.match(source,/onclick=googleSignInFlow.start/);assert.match(source,/if\(googleSignInFlow.getError\(\)\)showCloudLoginError/);
});
