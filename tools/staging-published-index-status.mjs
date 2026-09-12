// Only polls operations already returned by the fixed staging index tool.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {stagingIndexRequests} from './staging-published-index-plan.mjs';
const [path] = process.argv.slice(2), project = 'danbridge-d8877-staging';
const allowed = new Set(stagingIndexRequests(project).map(row => row.name));
const operations = (await readFile(path, 'utf8')).trim().split('\n').map(JSON.parse)
  .filter(row => row.phase === 'submitted').map(row => row.operation);
if (!operations.length || operations.length > allowed.size) throw Error('Invalid operation list');
for (const row of operations) {
  if (!allowed.has(row.metadata?.field) || !row.name?.startsWith(`projects/${project}/databases/(default)/operations/`)) throw Error('Foreign index operation');
}
const require = createRequire(import.meta.url), base = '/usr/local/lib/node_modules/firebase-tools/lib';
const account = require(base + '/auth.js').getGlobalDefaultAccount();
await require(base + '/requireAuth.js').requireAuth({project, user: account.user, tokens: account.tokens});
const {Client} = require(base + '/apiv2.js');
const client = new Client({auth: true, apiVersion: 'v1', urlPrefix: 'https://firestore.googleapis.com'});
for (const row of operations) {
  const current = (await client.get('/' + row.name, {skipLog: {resBody: true}})).body;
  if (current.metadata?.field !== row.metadata.field) throw Error('Operation field changed');
  console.log(JSON.stringify({field: current.metadata.field, done: current.done === true, state: current.metadata.state, error: current.error || null}));
}
