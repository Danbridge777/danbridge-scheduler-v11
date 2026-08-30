import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDependencyAuditReports} from '../tools/verify_dependency_audit.mjs';

const clean=()=>({auditReportVersion:2,vulnerabilities:{},metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}});
const packageJson=()=>({
 dependencies:{'firebase-admin':'14.2.0','firebase-functions':'7.3.2','google-auth-library':'11.0.2'},
 devDependencies:{},
 overrides:{uuid:'11.1.1'}
});
const finding=()=>({name:'uuid',severity:'moderate',isDirect:false,via:[],effects:[],range:'<11.1.1',nodes:['node_modules/uuid'],fixAvailable:true});

test('dependency audit policy accepts exact production versions, patched uuid, and zero findings',()=>{
 assert.deepEqual(
  verifyDependencyAuditReports({productionReport:clean(),fullReport:clean(),packageJson:packageJson()}),
  {productionAuditState:'clean',fullAuditState:'clean'}
 );
});

test('dependency audit policy rejects findings, severity drift, dependency drift, and override removal',()=>{
 const production=clean();production.vulnerabilities.uuid=finding();production.metadata.vulnerabilities={info:0,low:0,moderate:1,high:0,critical:0,total:1};
 assert.throws(()=>verifyDependencyAuditReports({productionReport:production,fullReport:clean(),packageJson:packageJson()}),/production dependencies must have zero vulnerabilities/);
 const full=clean();full.vulnerabilities.uuid=finding();full.metadata.vulnerabilities={info:0,low:0,moderate:1,high:0,critical:0,total:1};
 assert.throws(()=>verifyDependencyAuditReports({productionReport:clean(),fullReport:full,packageJson:packageJson()}),/full dependencies must have zero vulnerabilities/);
 const inconsistent=clean();inconsistent.metadata.vulnerabilities.high=1;
 assert.throws(()=>verifyDependencyAuditReports({productionReport:inconsistent,fullReport:clean(),packageJson:packageJson()}),/production audit severity totals must all be zero/);
 const versionDrift=packageJson();versionDrift.dependencies['firebase-admin']='14.3.0';
 assert.throws(()=>verifyDependencyAuditReports({productionReport:clean(),fullReport:clean(),packageJson:versionDrift}),/firebase-admin production version changed/);
 const duplicate=packageJson();duplicate.devDependencies['firebase-functions']='7.3.2';
 assert.throws(()=>verifyDependencyAuditReports({productionReport:clean(),fullReport:clean(),packageJson:duplicate}),/must not be duplicated/);
 const noOverride=packageJson();delete noOverride.overrides;
 assert.throws(()=>verifyDependencyAuditReports({productionReport:clean(),fullReport:clean(),packageJson:noOverride}),/uuid security override changed/);
});
