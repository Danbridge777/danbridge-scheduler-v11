import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bootstrapDanbridgeFirebase,resolveDanbridgeFirebaseEnvironment} from '../js/core/firebase-environment-bootstrap.js';

const configs={
 staging:{projectId:'danbridge-d8877-staging'},
 production:{projectId:'danbridge-d8877'}
};
const canonical=new Map([
 ['danbridge-d8877-staging.web.app',['staging','danbridge-d8877-staging']],
 ['danbridge-d8877-staging.firebaseapp.com',['staging','danbridge-d8877-staging']],
 ['danbridge-d8877.web.app',['production','danbridge-d8877']],
 ['danbridge-d8877.firebaseapp.com',['production','danbridge-d8877']]
]);

function spies(){
 const calls={app:0,auth:0,firestore:0};
 return {calls,initializeApp(config){calls.app++;return{options:config}},getAuth(app){calls.auth++;return{app}},initializeFirestore(app,options){calls.firestore++;return{app,options}}};
}

for(const [hostname,[environment,projectId]] of canonical)test(`canonical Firebase host ${hostname}`,()=>{
 assert.equal(resolveDanbridgeFirebaseEnvironment(hostname),environment);
 const spy=spies(),result=bootstrapDanbridgeFirebase({hostname,configs,...spy,firestoreOptions:{cache:'persistent'}});
 assert.equal(result.environment,environment);
 assert.equal(result.firebaseConfig.projectId,projectId);
 assert.deepEqual(spy.calls,{app:1,auth:1,firestore:1});
 assert.equal(result.app.options.projectId,projectId);
 assert.equal(result.auth.app,result.app);
 assert.equal(result.cloud.app,result.app);
});

const blocked=[
 '',undefined,null,'localhost','127.0.0.1','danbridge777.github.io',
 'danbridge--preview.web.app','danbridge-d8877-staging--foo.web.app','foo---bar.web.app',
 'danbridge-d8877.web.app.','danbridge-d8877-staging.firebaseapp.com.',
 'evil-danbridge-d8877.web.app','danbridge-d8877.web.app.evil.test',
 'danbridge-d8877-staging.firebaseapp.com.evil.test','DANBRIDGE-D8877.WEB.APP','unknown.example'
];
for(const hostname of blocked)test(`blocked Firebase host ${String(hostname)}`,()=>{
 const spy=spies();
 assert.throws(()=>bootstrapDanbridgeFirebase({hostname,configs,...spy,firestoreOptions:{}}),/Blocked Firebase hostname/);
 assert.deepEqual(spy.calls,{app:0,auth:0,firestore:0});
});

test('environment and project ID must remain exact before Firebase initialization',()=>{
 for(const [hostname,[environment]] of canonical){
  const hostile={...configs,[environment]:{projectId:environment==='staging'?'danbridge-d8877':'danbridge-d8877-staging'}},spy=spies();
  assert.throws(()=>bootstrapDanbridgeFirebase({hostname,configs:hostile,...spy,firestoreOptions:{}}),/environment\/project mismatch/);
  assert.deepEqual(spy.calls,{app:0,auth:0,firestore:0});
 }
});

test('hosting payload and manifest inventory exclude every Firebase debug-log variant',async()=>{
 const firebase=JSON.parse(await readFile(new URL('../firebase.json',import.meta.url),'utf8'));
 assert.ok(firebase.hosting.ignore.includes('firebase-debug*.log'));
 assert.ok(firebase.hosting.ignore.includes('firestore-debug*.log'));
 const variants=['firebase-debug.log','firebase-debug2.log','firebase-debug 2.log','firebase-debug-99.log','firestore-debug.log','firestore-debug2.log','firestore-debug 2.log','firestore-debug-99.log'];
 const matches=(pattern,name)=>new RegExp(`^${pattern.replace(/[\\^$+?.()|[\]{}]/g,'\\$&').replaceAll('*','.*')}$`).test(name);
 for(const name of variants)assert.ok(firebase.hosting.ignore.some(pattern=>matches(pattern,name)),name);
 assert.equal(firebase.hosting.ignore.some(pattern=>matches(pattern,'application.log')),false);
 const validator=await readFile(new URL('../tools/validate_project.py',import.meta.url),'utf8');
 assert.match(validator,/EXCLUDED_LOG_PREFIXES=\('firebase-debug','firestore-debug'\)/);
 assert.match(validator,/rel\.suffix=='\.log'.*rel\.name\.startswith\(prefix\)/);
 const inventoryIncluded=name=>!(name.endsWith('.log')&&['firebase-debug','firestore-debug'].some(prefix=>name.startsWith(prefix)));
 for(const name of variants)assert.equal(inventoryIncluded(name),false,name);
 assert.equal(inventoryIncluded('application.log'),true);
 const manifest=JSON.parse(await readFile(new URL('../docs/sha256-manifest.json',import.meta.url),'utf8'));
 for(const key of Object.keys(manifest))assert.equal(variants.includes(key)||variants.some(name=>key.endsWith(`/${name}`)),false,key);
 assert.ok(manifest['js/core/firebase-environment-bootstrap.js']);
 assert.ok(manifest['tests/firebase-environment-bootstrap.test.mjs']);
});
