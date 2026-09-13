import {assembleRoleViewChunks,prepareRoleViewChunks} from './role-view-chunks.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

// Read-only audit: a published marker must never fall back to an embedded copy.
export async function readRoleViewForAudit({head,identity,expectedSourceHash,readPart,readCurrentHead}){
 const legacyKey=identity.kind==='branch_manager'?'scopedDb':'db';
 if(!Object.hasOwn(head||{},'roleChunkManifest'))return head?.[legacyKey]||null;
 const manifest=head.roleChunkManifest;
 if(!manifest||manifest.sourceHash!==expectedSourceHash||!Array.isArray(manifest.chunkIds)||manifest.chunkIds.some(id=>!/^[a-f0-9]{64}$/.test(id))||!/^[a-f0-9]{64}$/.test(manifest.scope||''))throw Error('Role audit manifest/source mismatch');
 const parts=[];
 for(let i=0;i<manifest.chunkIds.length;i+=12)parts.push(...await Promise.all(manifest.chunkIds.slice(i,i+12).map(id=>readPart(id,manifest.scope))));
 await prepareRoleViewChunks(parts);
 const db=assembleRoleViewChunks(manifest,parts,{identity,minSourceRevision:manifest.sourceRevision,expectedSourceHash});
 const current=await readCurrentHead();
 if(!current||sha256Canonical(current)!==sha256Canonical(head))throw Error('Role head changed during audit');
 return db;
}
