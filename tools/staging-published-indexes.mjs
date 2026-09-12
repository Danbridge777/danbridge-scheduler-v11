// Reversible index metadata only; never changes documents, IAM or Rules.
// Read-back mode is the default. Apply is confined to the audited staging list.
import {createRequire} from 'node:module';
import {stagingIndexRequests} from './staging-published-index-plan.mjs';
const [project, mode = 'read'] = process.argv.slice(2);
const requests = stagingIndexRequests(project);
if (!['read', 'apply'].includes(mode)) throw Error('Expected read or apply');
const require = createRequire(import.meta.url), base = '/usr/local/lib/node_modules/firebase-tools/lib';
const account = require(base + '/auth.js').getGlobalDefaultAccount();
await require(base + '/requireAuth.js').requireAuth({project, user: account.user, tokens: account.tokens});
const {Client} = require(base + '/apiv2.js');
const client = new Client({auth: true, apiVersion: 'v1', urlPrefix: 'https://firestore.googleapis.com'});
for (const body of requests) {
  const before = (await client.get('/' + body.name, {skipLog: {resBody: true}})).body;
  console.log(JSON.stringify({phase: 'before', field: before}));
  if (mode === 'read') continue;
  if (before.indexConfig?.usesAncestorConfig !== true) {
    if ((before.indexConfig?.indexes || []).length === 0) {
      console.log(JSON.stringify({phase: 'already-exempt', name: body.name}));
      continue;
    }
    throw Error('Existing explicit index configuration must not be overwritten: ' + body.name);
  }
  const operation = (await client.patch('/' + body.name, body, {
    queryParams: {updateMask: 'indexConfig'}, skipLog: {resBody: true},
  })).body;
  console.log(JSON.stringify({phase: 'submitted', operation}));
}
