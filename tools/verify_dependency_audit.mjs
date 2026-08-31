#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PRODUCTION_VERSIONS=Object.freeze({
 'firebase':'12.17.1',
 'firebase-admin':'14.2.0',
 'firebase-functions':'7.3.2',
 'google-auth-library':'11.0.2'
});
const UUID_OVERRIDE_VERSION='11.1.1';
const ZERO_VULNERABILITY_TOTALS=Object.freeze({info:0,low:0,moderate:0,high:0,critical:0,total:0});

function own(value,key){return Object.prototype.hasOwnProperty.call(value,key)}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
function exact(actual,expected,message){assert.deepEqual(canonical(actual),canonical(expected),message)}
function assertClean(report,label){
 assert.equal(report?.auditReportVersion,2,`${label} audit report version changed`);
 assert.ok(report.vulnerabilities&&typeof report.vulnerabilities==='object'&&!Array.isArray(report.vulnerabilities),`${label} vulnerabilities missing`);
 assert.deepEqual(Object.keys(report.vulnerabilities),[],`${label} dependencies must have zero vulnerabilities`);
 exact(report?.metadata?.vulnerabilities,ZERO_VULNERABILITY_TOTALS,`${label} audit severity totals must all be zero`);
}

export function verifyDependencyAuditReports({productionReport,fullReport,packageJson}){
 assert.ok(packageJson&&typeof packageJson==='object','package.json is required');
 for(const [name,version] of Object.entries(PRODUCTION_VERSIONS)){
  assert.equal(packageJson.dependencies?.[name],version,`${name} production version changed; re-review the runtime dependency`);
  assert.equal(own(packageJson.devDependencies??{},name),false,`${name} must not be duplicated as a devDependency`);
 }
 assert.deepEqual(packageJson.overrides,{uuid:UUID_OVERRIDE_VERSION},'uuid security override changed; re-review GHSA-w5hq-g745-h8pq');
 assertClean(productionReport,'production');
 assertClean(fullReport,'full');
 return Object.freeze({productionAuditState:'clean',fullAuditState:'clean'});
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
 verifyDependencyAuditReports({productionReport,fullReport,packageJson});
 console.log(`PASS: production and full dependency audits are clean; uuid override=${UUID_OVERRIDE_VERSION}.`);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
