import test from 'node:test';
import assert from 'node:assert/strict';
import {KNOWN_DEV_ONLY_AUDIT,verifyDependencyAuditReports} from '../tools/verify_dependency_audit.mjs';

const clean=()=>({auditReportVersion:2,vulnerabilities:{},metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}});
const known=()=>({auditReportVersion:2,vulnerabilities:structuredClone(KNOWN_DEV_ONLY_AUDIT),metadata:{vulnerabilities:{info:0,low:0,moderate:6,high:0,critical:0,total:6}}});
const packageJson=()=>({devDependencies:{'firebase-admin':'^14.2.0'}});

test('dependency audit policy accepts zero production findings and the exact reviewed dev-only chain',()=>{
 assert.equal(verifyDependencyAuditReports({productionReport:clean(),fullReport:known(),packageJson:packageJson()}).fullAuditState,'known-dev-only');
 assert.equal(verifyDependencyAuditReports({productionReport:clean(),fullReport:clean(),packageJson:packageJson()}).fullAuditState,'clean');
});

test('dependency audit policy rejects production findings, new advisories, severity drift, and production firebase-admin',()=>{
 const production=clean();production.vulnerabilities.uuid=structuredClone(KNOWN_DEV_ONLY_AUDIT.uuid);production.metadata.vulnerabilities={info:0,low:0,moderate:1,high:0,critical:0,total:1};
 assert.throws(()=>verifyDependencyAuditReports({productionReport:production,fullReport:known(),packageJson:packageJson()}),/production dependencies must have zero vulnerabilities/);
 const unknown=known();unknown.vulnerabilities.unreviewed={...structuredClone(KNOWN_DEV_ONLY_AUDIT.gaxios),name:'unreviewed'};unknown.metadata.vulnerabilities.moderate=7;unknown.metadata.vulnerabilities.total=7;
 assert.throws(()=>verifyDependencyAuditReports({productionReport:clean(),fullReport:unknown,packageJson:packageJson()}),/new, missing, or renamed vulnerability/);
 const severe=known();severe.vulnerabilities.uuid.severity='high';
 assert.throws(()=>verifyDependencyAuditReports({productionReport:clean(),fullReport:severe,packageJson:packageJson()}),/uuid advisory or dependency path changed/);
 const inconsistentProduction=clean();inconsistentProduction.metadata.vulnerabilities.high=1;
 assert.throws(()=>verifyDependencyAuditReports({productionReport:inconsistentProduction,fullReport:known(),packageJson:packageJson()}),/production audit severity totals must all be zero/);
 const inconsistentCleanFull=clean();inconsistentCleanFull.metadata.vulnerabilities.moderate=1;
 assert.throws(()=>verifyDependencyAuditReports({productionReport:clean(),fullReport:inconsistentCleanFull,packageJson:packageJson()}),/clean full audit severity totals must all be zero/);
 assert.throws(()=>verifyDependencyAuditReports({productionReport:clean(),fullReport:known(),packageJson:{dependencies:{'firebase-admin':'^14.2.0'},devDependencies:{'firebase-admin':'^14.2.0'}}}),/must not be a production dependency/);
});
