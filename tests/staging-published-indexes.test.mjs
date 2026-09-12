import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGING_INDEX_EXEMPTIONS, stagingIndexRequests} from '../tools/staging-published-index-plan.mjs';

test('index experiment cannot address production or a wildcard collection/field', () => {
  for (const project of ['danbridge-d8877', '', undefined, 'another-staging']) {
    assert.throws(() => stagingIndexRequests(project), /Exact staging/);
  }
  const requests = stagingIndexRequests('danbridge-d8877-staging');
  assert.equal(requests.length, 8);
  assert.equal(new Set(requests.map(row => row.name)).size, 8);
  for (const row of requests) {
    assert.match(row.name, /^projects\/danbridge-d8877-staging\/databases\/\(default\)\/collectionGroups\/\w+\/fields\/\w+$/);
    assert.deepEqual(row.indexConfig, {indexes: []});
  }
});

test('query, authorization and cleanup fields retain their indexes', () => {
  const required = new Set(['recipientEmail', 'createdAt', 'read', 'role', 'companyId', 'email', 'kind', 'recordId', 'teacherId', 'branchId', 'status', 'occurredAt']);
  for (const {fieldPath} of STAGING_INDEX_EXEMPTIONS) assert.equal(required.has(fieldPath), false);
  assert.ok(Object.isFrozen(STAGING_INDEX_EXEMPTIONS));
  assert.ok(STAGING_INDEX_EXEMPTIONS.every(Object.isFrozen));
});
