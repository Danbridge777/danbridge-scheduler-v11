#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const FIREBASE_ADMIN_VERSION='^14.2.0';
const VULNERABILITY_FIELDS=['effects','fixAvailable','isDirect','name','nodes','range','severity','via'];
const ZERO_VULNERABILITY_TOTALS=Object.freeze({info:0,low:0,moderate:0,high:0,critical:0,total:0});

export const KNOWN_DEV_ONLY_AUDIT=Object.freeze({
 '@google-cloud/storage':{name:'@google-cloud/storage',severity:'moderate',isDirect:false,via:['retry-request','teeny-request'],effects:['firebase-admin'],range:'2.2.0 - 2.5.0 || 5.19.0 - 8.0.0',nodes:['node_modules/@google-cloud/storage'],fixAvailable:{name:'firebase-admin',version:'10.3.0',isSemVerMajor:true}},
 'firebase-admin':{name:'firebase-admin',severity:'moderate',isDirect:true,via:['@google-cloud/storage'],effects:[],range:'7.0.0 - 8.2.0 || >=11.0.0',nodes:['node_modules/firebase-admin'],fixAvailable:{name:'firebase-admin',version:'10.3.0',isSemVerMajor:true}},
 gaxios:{name:'gaxios',severity:'moderate',isDirect:false,via:['uuid'],effects:[],range:'6.4.0 - 6.7.1',nodes:['node_modules/gaxios'],fixAvailable:true},
 'retry-request':{name:'retry-request',severity:'moderate',isDirect:false,via:['teeny-request'],effects:['@google-cloud/storage'],range:'7.0.0 - 7.0.2',nodes:['node_modules/retry-request'],fixAvailable:{name:'firebase-admin',version:'10.3.0',isSemVerMajor:true}},
 'teeny-request':{name:'teeny-request',severity:'moderate',isDirect:false,via:['uuid'],effects:['@google-cloud/storage','retry-request'],range:'3.9.1 - 9.0.0',nodes:['node_modules/teeny-request'],fixAvailable:{name:'firebase-admin',version:'10.3.0',isSemVerMajor:true}},
 uuid:{name:'uuid',severity:'moderate',isDirect:false,via:[{source:1119441,name:'uuid',dependency:'uuid',title:'uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided',url:'https://github.com/advisories/GHSA-w5hq-g745-h8pq',severity:'moderate',cwe:['CWE-787','CWE-1285'],cvss:{score:7.5,vectorString:'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N'},range:'<11.1.1'}],effects:['gaxios','teeny-request'],range:'<11.1.1',nodes:['node_modules/uuid'],fixAvailable:{name:'firebase-admin',version:'10.3.0',isSemVerMajor:true}}
});

function own(value,key){return Object.prototype.hasOwnProperty.call(value,key)}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
function exact(actual,expected,message){assert.deepEqual(canonical(actual),canonical(expected),message)}
function vulnerabilities(report,label){
 assert.equal(report?.auditReportVersion,2,`${label} audit report version changed`);
 assert.ok(report.vulnerabilities&&typeof report.vulnerabilities==='object'&&!Array.isArray(report.vulnerabilities),`${label} vulnerabilities missing`);
 return report.vulnerabilities;
}
function assertCleanProduction(report){
 const found=vulnerabilities(report,'production');
 assert.deepEqual(Object.keys(found),[],'production dependencies must have zero vulnerabilities');
 exact(report?.metadata?.vulnerabilities,ZERO_VULNERABILITY_TOTALS,'production audit severity totals must all be zero');
}
function assertKnownFullAudit(report){
 const found=vulnerabilities(report,'full');
 const names=Object.keys(found).sort();
 if(names.length===0){
  exact(report?.metadata?.vulnerabilities,ZERO_VULNERABILITY_TOTALS,'clean full audit severity totals must all be zero');
  return 'clean';
 }
 assert.deepEqual(names,Object.keys(KNOWN_DEV_ONLY_AUDIT).sort(),'full audit contains a new, missing, or renamed vulnerability');
 exact(report.metadata.vulnerabilities,{info:0,low:0,moderate:6,high:0,critical:0,total:6},'full audit severity totals changed');
 for(const name of names){
  assert.deepEqual(Object.keys(found[name]).sort(),VULNERABILITY_FIELDS,`${name} audit fields changed`);
  exact(found[name],KNOWN_DEV_ONLY_AUDIT[name],`${name} advisory or dependency path changed`);
 }
 return 'known-dev-only';
}

export function verifyDependencyAuditReports({productionReport,fullReport,packageJson}){
 assert.ok(packageJson&&typeof packageJson==='object','package.json is required');
 assert.equal(own(packageJson.dependencies??{},'firebase-admin'),false,'firebase-admin must not be a production dependency');
 assert.equal(packageJson.devDependencies?.['firebase-admin'],FIREBASE_ADMIN_VERSION,'firebase-admin devDependency version changed; re-review the audit exception');
 assertCleanProduction(productionReport);
 return Object.freeze({fullAuditState:assertKnownFullAudit(fullReport)});
}

function runNpmAudit(extraArgs){
 const command=process.platform==='win32'?'npm.cmd':'npm';
 const result=spawnSync(command,['audit','--json','--audit-level=low',...extraArgs],{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});
 if(result.error)throw result.error;
 if(result.status!==0&&result.status!==1)throw new Error(`npm audit failed to run (exit ${result.status}): ${result.stderr.trim()}`);
 try{return JSON.parse(result.stdout)}catch(error){throw new Error(`npm audit returned invalid JSON: ${error.message}`)}
}

export function main(){
 const packageJson=JSON.parse(readFileSync(resolve(ROOT,'package.json'),'utf8'));
 const productionReport=runNpmAudit(['--omit=dev']);
 const fullReport=runNpmAudit([]);
 const result=verifyDependencyAuditReports({productionReport,fullReport,packageJson});
 console.log(`PASS: production dependency audit is clean; full audit state=${result.fullAuditState}.`);
 if(result.fullAuditState==='known-dev-only')console.log('Accepted exact dev-only optional chain: firebase-admin -> @google-cloud/storage -> uuid GHSA-w5hq-g745-h8pq.');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
