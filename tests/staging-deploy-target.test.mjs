import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  EXPECTED_STAGING_DEPLOY_SCRIPT,
  validateConfigValues,
  validateMarkdownText
} from '../tools/validate_staging_deploy_target.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const baseline = () => ({
  firebaserc: readJson('.firebaserc'),
  firebaseConfig: readJson('firebase.json'),
  productionConfig: readJson('firebase.production.json'),
  packageConfig: readJson('package.json')
});
const rejected = (mutate, pattern = /TARGET_CONFIG_INVALID/) => {
  const config = baseline();
  mutate(config);
  assert.throws(() => validateConfigValues(config), pattern);
};

test('baseline target config is exact and CLI is read-only with one success token', () => {
  assert.equal(validateConfigValues(baseline()), true);
  const result = spawnSync(process.execPath, [resolve(ROOT, 'tools/validate_staging_deploy_target.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {}
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'TARGET_CONFIG_VALID\n');
  assert.equal(result.stderr, '');
});

test('CLI rejects every argument before reading credentials or invoking tools', () => {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'tools/validate_staging_deploy_target.mjs'), '--project', 'production'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {}
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /CLI arguments are forbidden/);
});

test('project aliases are exact and reject missing, unknown, whitespace, case and foreign targets', () => {
  for (const mutate of [
    c => { delete c.firebaserc.projects.staging; },
    c => { c.firebaserc.projects.preview = 'danbridge-d8877-staging'; },
    c => { c.firebaserc.projects.staging = 'danbridge-d8877-staging '; },
    c => { c.firebaserc.projects.staging = 'Danbridge-d8877-staging'; },
    c => { c.firebaserc.projects.staging = 'danbridge-d8877'; },
    c => { c.firebaserc.projects.default = 'danbridge-d8877-staging'; },
    c => { c.firebaserc = []; }
  ]) rejected(mutate);
});

test('Firebase Rules, emulator and Hosting schema reject routing and inventory drift', () => {
  for (const mutate of [
    c => { c.firebaseConfig.firestore.rules = 'firestore.rules'; },
    c => { c.firebaseConfig.firestore.indexes = 'firebase/firestore.indexes.json'; },
    c => { c.firebaseConfig.firestore = []; },
    c => { c.firebaseConfig.hosting = [c.firebaseConfig.hosting]; },
    c => { c.firebaseConfig.hosting.public = 'public'; },
    c => { c.firebaseConfig.hosting.site = 'danbridge-d8877-staging'; },
    c => { c.firebaseConfig.hosting.target = 'staging'; },
    c => { c.firebaseConfig.hosting.ignore = c.firebaseConfig.hosting.ignore.filter(x => x !== 'firebase-debug*.log'); },
    c => { c.firebaseConfig.hosting.ignore = c.firebaseConfig.hosting.ignore.filter(x => x !== 'firestore-debug*.log'); },
    c => { c.firebaseConfig.hosting.ignore = c.firebaseConfig.hosting.ignore.filter(x => x !== '.firebase/**'); },
    c => { c.firebaseConfig.emulators.firestore.port = 8081; },
    c => { c.firebaseConfig.storage = {}; }
  ]) rejected(mutate);
});

test('production Hosting is isolated from staging-only rules, functions and rewrites', () => {
  for (const mutate of [
    c => { c.productionConfig.firestore = { rules: 'firebase/firestore.rules.deploy' }; },
    c => { c.productionConfig.functions = c.firebaseConfig.functions; },
    c => { c.productionConfig.hosting.rewrites = c.firebaseConfig.hosting.rewrites; },
    c => { c.productionConfig.hosting.public = 'public'; },
    c => { c.productionConfig.hosting.ignore = c.productionConfig.hosting.ignore.filter(x => x !== 'firebase.production.json'); }
  ]) rejected(mutate);
});

test('staging release deploys Hosting only and leaves phased Rules on their explicit workflow', () => {
  assert.equal(
    baseline().packageConfig.scripts['deploy:staging'],
    'node tools/validate_staging_deploy_target.mjs && firebase deploy --only hosting --project danbridge-d8877-staging --'
  );
});

test('staging lifecycle rejects alias, production, foreign, missing, duplicate, config, scope and shell drift', () => {
  for (const script of [
    'firebase deploy --only hosting,firestore:rules --project staging',
    'firebase deploy --only hosting,firestore:rules --project production',
    'firebase deploy --only hosting,firestore:rules --project foreign-project',
    'firebase deploy --only hosting,firestore:rules',
    'firebase deploy --only hosting,firestore:rules --project danbridge-d8877-staging --project production --',
    'firebase deploy --config other.json --only hosting,firestore:rules --project danbridge-d8877-staging --',
    'firebase deploy --only hosting --project danbridge-d8877-staging --',
    'firebase deploy --only hosting,firestore:rules,storage --project danbridge-d8877-staging --',
    'firebase deploy --only firestore:rules,hosting --project danbridge-d8877-staging --',
    'firebase deploy --only hosting,firestore:rules --project danbridge-d8877-staging -- && echo unsafe'
  ]) rejected(c => { c.packageConfig.scripts['deploy:staging'] = script; });
  rejected(c => { delete c.packageConfig.scripts['predeploy:staging']; });
  rejected(c => { c.packageConfig.scripts['predeploy:staging'] += ' --project staging'; });
  rejected(c => { c.packageConfig.scripts['predeploy:production'] = 'node unsafe.mjs'; });
  rejected(c => { c.packageConfig.scripts['postdeploy:staging'] = 'node unsafe.mjs'; });
  rejected(c => { c.packageConfig.scripts.deploy = 'firebase deploy'; });
  rejected(c => { c.packageConfig.scripts['deploy:production'] += ' '; }, /production script changed/);
});

test('double-dash sentinel keeps forwarded production project outside Firebase options', () => {
  assert.equal(EXPECTED_STAGING_DEPLOY_SCRIPT, baseline().packageConfig.scripts['deploy:staging']);
  const firebaseCommand = EXPECTED_STAGING_DEPLOY_SCRIPT.split(' && ')[1];
  const fakeFirebaseParser = argv => {
    const sentinel = argv.indexOf('--');
    if (sentinel < 0) throw new Error('missing option terminator');
    if (argv.slice(sentinel + 1).length !== 0) throw new Error('operands after option terminator are forbidden');
    const options = argv.slice(0, sentinel);
    const projects = options.filter((token, index) => options[index - 1] === '--project');
    if (projects.length !== 1 || projects[0] !== 'danbridge-d8877-staging') throw new Error('wrong project');
    return true;
  };
  const baselineArgv = firebaseCommand.split(' ').slice(2);
  assert.equal(fakeFirebaseParser(baselineArgv), true);
  assert.throws(
    () => fakeFirebaseParser([...baselineArgv, '--project', 'production']),
    /operands after option terminator are forbidden/
  );
});

test('validator source has no subprocess, network, credential, environment or write capability', () => {
  const source = readFileSync(resolve(ROOT, 'tools/validate_staging_deploy_target.mjs'), 'utf8');
  assert.doesNotMatch(source, /node:child_process|\bspawn\b|\bexec(File|Sync)?\b|\bfetch\b|node:https?|XMLHttpRequest/);
  assert.doesNotMatch(source, /process\.env|credential|writeFile|appendFile|createWriteStream|firebase-admin|firebase\/app|firebase\/auth/);
  assert.match(source, /lstatSync/);
  assert.match(source, /readdirSync\(directory, \{ withFileTypes: true \}\)/);
  assert.match(source, /entry\.isSymbolicLink\(\)/);
  assert.match(source, /DOC_SCAN_EXCLUDED_DIRS/);
  assert.match(source, /process\.argv\.length !== 2/);
});

test('deployment documentation contains no naked deploy or ungated deletion instruction', () => {
  const doc = readFileSync(resolve(ROOT, 'firebase/DEPLOY_RULES.md'), 'utf8');
  assert.doesNotMatch(doc, /firebase\s+deploy/i);
  assert.doesNotMatch(doc, /Firebase Console[^\n]*刪除|刪除[^\n]*集合/);
  assert.match(doc, /npm run deploy:staging/);
  assert.match(doc, /不代表 staging readiness/);
  assert.match(doc, /production[^\n]*獨立明確授權/i);
});

test('all repository Markdown avoids raw Firebase deploy commands', () => {
  assert.equal(validateMarkdownText('Use npm run deploy:staging only.', 'safe.md'), true);
  assert.throws(() => validateMarkdownText('firebase deploy --only firestore:rules', 'unsafe.md'), /raw Firebase deploy/);
});
