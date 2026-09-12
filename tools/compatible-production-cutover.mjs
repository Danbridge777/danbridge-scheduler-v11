// Scoped release control only. Never writes lessons, billing, or payroll.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {assertProductionRecordRuntimeControl,assertProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH} from '../js/core/cloud-production-record-runtime.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
import {patchProductionRoleChunkRules} from './production-role-chunk-rules-patch.mjs';
export const PROJECT='danbridge-d8877';
export function transitionSafety(current,mode,at){
 assertProductionRecordRuntimeSafety(current,{activationEpoch:current.activationEpoch});
 if(!['pause','resume'].includes(mode)||current.state!==(mode==='pause'?'active':'paused')||!Number.isFinite(Date.parse(at)))throw Error('Unexpected safety transition');
 const next={...current,state:mode==='pause'?'paused':'active',writeAllowed:mode!=='pause',revision:current.revision+1,previousEventHash:current.lastEventHash,updatedAt:at};
 const core={...next};
 for(const key of ['lastEventHash','persistedAt','activatedBy','activatedByEmail','updatedBy','updatedByEmail'])delete core[key];
 next.lastEventHash=sha256Canonical(core);
 assertProductionRecordRuntimeSafety(next,{activationEpoch:current.activationEpoch});return next;
}
async function main(){
 const mode=process.argv[2];if(!['pause','resume','rules'].includes(mode))throw Error('Explicit pause, resume or rules mode required');
 const proof='/private/tmp/danbridge-317-production-cutover-state.json';
 const require=createRequire(import.meta.url),base='/usr/local/lib/node_modules/firebase-tools/lib',account=require(base+'/auth.js').getGlobalDefaultAccount();
 await require(base+'/requireAuth.js').requireAuth({project:PROJECT,user:account.user,tokens:account.tokens});
 const token=await require(base+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
 const db=new Firestore({projectId:PROJECT,authClient});
 try{
  const saved=mode==='pause'?null:JSON.parse(await readFile(proof,'utf8'));
  if(saved&&(saved.project!==PROJECT||saved.release!=='20.26.317'))throw Error('Release proof mismatch');
  if(mode==='rules'){
   const current=(await db.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();if(current.lastEventHash!==saved.paused.lastEventHash||current.state!=='paused')throw Error('Expected exact paused release');
   const {Client}=require(base+'/apiv2.js'),api=require(base+'/api.js'),client=new Client({urlPrefix:api.rulesOrigin(),apiVersion:'v1'}),rules=require(base+'/gcp/rules.js');
   const releasePath='/projects/'+PROJECT+'/releases/cloud.firestore';
   const before=(await client.get(releasePath)).body;
   const files=(await client.get('/'+before.rulesetName,{skipLog:{resBody:true}})).body.source.files;
   if(files.length!==1)throw Error('Unexpected rules source count');
   const patch=patchProductionRoleChunkRules(files[0].content);
   const desired=[{...files[0],content:patch.source}];
   if(patch.changed){
    const compiled=await rules.testRuleset(PROJECT,desired);
    if(compiled.status!==200||(compiled.body?.issues||[]).some(issue=>issue.severity==='ERROR'))throw Error('Rules compilation failed');
    const created=await rules.createRuleset(PROJECT,desired,'cloud.firestore');
    if((await client.get(releasePath)).body.rulesetName!==before.rulesetName)throw Error('Rules changed concurrently; created version retained, not activated');
    if(typeof created!=='string'||!created.startsWith('projects/'+PROJECT+'/rulesets/'))throw Error('Unexpected created ruleset name');
    await rules.updateRelease(PROJECT,created,'cloud.firestore');
   }
   const after=(await client.get(releasePath)).body,readback=(await client.get('/'+after.rulesetName,{skipLog:{resBody:true}})).body.source.files;
   if(readback.length!==1||readback[0].content!==patch.source)throw Error('Rules readback mismatch');
   console.log(JSON.stringify({project:PROJECT,mode,previousRuleset:before.rulesetName,ruleset:after.rulesetName,sha256:patch.afterSha256,formalDataWrites:0}));return;
  }
  if(mode==='pause'){
   // Refuse to overwrite an existing cutover record, including an uncertain attempt.
   await writeFile(proof,JSON.stringify({project:PROJECT,release:'20.26.317',state:'preparing'}),{flag:'wx',mode:0o600});
  }
  const result=await db.runTransaction(async tx=>{
   const [controlRow,row]=await tx.getAll(db.doc(PRODUCTION_RECORD_CONTROL_PATH),db.doc(PRODUCTION_RECORD_SAFETY_PATH));
   const control=assertProductionRecordRuntimeControl(controlRow.data()),current=assertProductionRecordRuntimeSafety(row.data(),{activationEpoch:control.activationEpoch});
   if(mode==='pause'&&current.recordRevision!==645)throw Error('Production authority moved since approved preflight; stop and recheck');
   if(mode==='resume'&&current.lastEventHash!==saved.paused.lastEventHash)throw Error('Paused authority changed; automatic resume refused');
   const next=transitionSafety(current,mode,new Date().toISOString());
   tx.set(row.ref,next);return{before:current,after:next};
  });
  if(mode==='pause')await writeFile(proof,JSON.stringify({project:PROJECT,release:'20.26.317',before:result.before,paused:result.after},null,2),{mode:0o600});
  const confirmed=(await db.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();
  if(confirmed.lastEventHash!==result.after.lastEventHash)throw Error('Safety confirmation changed; inspect before retry');
  console.log(JSON.stringify({project:PROJECT,mode,state:confirmed.state,recordRevision:confirmed.recordRevision,recordDataHash:confirmed.recordDataHash,controlWrites:1,formalDataWrites:0}));
 }finally{await db.terminate()}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
