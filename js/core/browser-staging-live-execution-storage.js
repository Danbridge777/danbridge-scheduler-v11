import {assertStagingExecutionManifestEnvelope} from './cloud-staging-live-activation.js';

const SCHEMA='danbridge-staging-live-execution-journal-v1';
const copy=value=>JSON.parse(JSON.stringify(value));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function createBrowserStagingLiveExecutionStorage({storage,manifestHash,manifest}={}){
 if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function'||typeof storage.exclusive!=='function'||!hash(manifestHash))throw new Error('staging live 本機執行儲存注入不完整');
 const supplied=manifest===undefined?null:copy(manifest);if(supplied){assertStagingExecutionManifestEnvelope(supplied);if(supplied.manifestHash!==manifestHash)throw new Error('staging live 本機 manifestHash 不符')}
 const readEnvelope=async({required=false}={})=>{const value=await storage.load();if(value==null){if(required)throw new Error('staging live 本機 manifest 不存在');return null}if(!value||value.schema!==SCHEMA||!Array.isArray(value.rows)||!value.manifest)throw new Error('staging live 本機執行封套格式無效');assertStagingExecutionManifestEnvelope(value.manifest);if(value.manifest.manifestHash!==manifestHash||supplied&&supplied.manifestHash!==value.manifest.manifestHash)throw new Error('staging live 本機執行封套 identity 衝突');return{schema:SCHEMA,manifest:copy(value.manifest),rows:copy(value.rows)}};
 const journalStorage={
  exclusive:work=>storage.exclusive(work),
  load:async()=>{const envelope=await readEnvelope();return envelope?.rows??null},
  save:async rows=>{if(!Array.isArray(rows))throw new Error('staging live 本機操作列格式無效');const existing=await readEnvelope(),boundManifest=existing?.manifest??supplied;if(!boundManifest)throw new Error('staging live 本機 manifest 不存在');await storage.save({schema:SCHEMA,manifest:copy(boundManifest),rows:copy(rows)})}
 };
 return{journalStorage,loadManifest:()=>storage.exclusive(async()=>copy((await readEnvelope({required:true})).manifest))};
}
