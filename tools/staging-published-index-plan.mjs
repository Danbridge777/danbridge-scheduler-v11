// These payloads are read by document ID or an unfiltered collection read.
// Never exempt recipientEmail, createdAt, read, role, companyId or record IDs.
export const STAGING_INDEX_EXEMPTIONS = Object.freeze([
  ['records', 'record'],
  ['scheduleNotifications', 'details'],
  ['teacherViews', 'roleChunkManifest'],
  ['schedulerViews', 'roleChunkManifest'],
  ['companyAccess', 'roleChunkManifest'],
  ['productionRoleChunkViews', 'groups'],
  ['productionRoleChunkViews', 'chunkIds'],
  ['productionNotificationDeliveryProofs', 'recipients'],
].map(([collectionGroup, fieldPath]) => Object.freeze({collectionGroup, fieldPath})));

export function stagingIndexRequests(projectId) {
  if (projectId !== 'danbridge-d8877-staging') throw Error('Exact staging project required');
  return STAGING_INDEX_EXEMPTIONS.map(({collectionGroup, fieldPath}) => ({
    name: `projects/${projectId}/databases/(default)/collectionGroups/${collectionGroup}/fields/${fieldPath}`,
    indexConfig: {indexes: []},
  }));
}
