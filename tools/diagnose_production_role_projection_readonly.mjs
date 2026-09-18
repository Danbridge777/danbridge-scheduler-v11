// Read-only projection diagnosis. Emits hashes/counts only, never business rows.
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS, rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {assembleRoleViewChunks} from '../js/core/role-view-chunks.js';

const project = 'danbridge-d8877';
const require = createRequire(import.meta.url);
const cli = '/usr/local/lib/node_modules/firebase-tools/lib';
const account = require(cli + '/auth.js').getGlobalDefaultAccount();
await require(cli + '/requireAuth.js').requireAuth({project, user: account.user, tokens: account.tokens});
const token = await require(cli + '/auth.js').getAccessToken(account.tokens.refresh_token, []);
const authClient = new OAuth2Client();
authClient.setCredentials({access_token: token.access_token});
const db = new Firestore({projectId: project, authClient});

try {
  const safety = (await db.doc('companies/danbridge/productionRecordRuntime/safety').get()).data();
  const [access, teachers, schedulers, ...snapshots] = await Promise.all([
    db.collection('companyAccess').where('companyId', '==', 'danbridge').get(),
    db.collection('companies/danbridge/teacherViews').get(),
    db.collection('companies/danbridge/schedulerViews').get(),
    ...FULL_RECORD_COLLECTIONS.map(collection => db.collection(`productionFullRecordShadows/danbridge/collections/${collection}/records`).get())
  ]);
  const source = rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((collection, index) => [collection, snapshots[index].docs.map(row => ({id: row.id, data: row.data()}))])), {environment: 'production'});
  if (recordDataHash(source.db) !== safety.recordDataHash) throw Error('Authority mismatch');
  const heads = new Map([...access.docs, ...teachers.docs, ...schedulers.docs].map(row => [row.ref.path, row.data()]));
  const views = buildProductionRoleViews(source.db, access.docs.map(row => ({...row.data(), email: row.id})), {now: Date.now()});
  const result = [];
  for (const view of views) {
    const branch = view.kind === 'branch_manager';
    const path = branch ? `companyAccess/${view.email}` : `companies/danbridge/${view.kind === 'teacher' ? 'teacherViews' : 'schedulerViews'}/${view.email}`;
    const head = heads.get(path);
    const manifest = head?.roleChunkManifest;
    const parts = [];
    for (let offset = 0; offset < manifest.chunkIds.length; offset += 100) {
      const rows = await db.getAll(...manifest.chunkIds.slice(offset, offset + 100).map(id => db.doc(`productionRoleChunkViews/${manifest.scope}/parts/${id}`)));
      parts.push(...rows.map(row => row.data()));
    }
    const assembled = assembleRoleViewChunks(manifest, parts, {identity: {email: view.email, kind: view.kind, teacherId: view.teacherId, branchIds: view.branchIds || []}, minSourceRevision: safety.recordRevision, expectedSourceHash: safety.recordDataHash});
    const expectedHash = recordDataHash(view.db);
    const legacyKey = branch ? 'scopedDb' : 'db';
    result.push({email: view.email, kind: view.kind, expectedHash, chunkHash: recordDataHash(assembled), chunkMatches: recordDataHash(assembled) === expectedHash, legacyPresent: Object.hasOwn(head, legacyKey), legacyMatches: Object.hasOwn(head, legacyKey) ? recordDataHash(head[legacyKey]) === expectedHash : null, sourceRevision: manifest.sourceRevision, publicationRevision: manifest.publicationRevision, release: head.release, expectedLessons: view.db.lessons.length, chunkLessons: assembled.lessons.length});
  }
  console.log(JSON.stringify({project, cloudWrites: 0, authorityHash: safety.recordDataHash, sourceRevision: safety.recordRevision, roles: result}, null, 2));
} finally {
  await db.terminate();
}
