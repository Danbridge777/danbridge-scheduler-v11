import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STAGING_PROJECT = 'danbridge-d8877-staging';
const PRODUCTION_PROJECT = 'danbridge-d8877';
const PREFLIGHT_SCRIPT = 'node tools/validate_staging_deploy_target.mjs';
const STAGING_DEPLOY_SCRIPT = `${PREFLIGHT_SCRIPT} && firebase deploy --only hosting --project ${STAGING_PROJECT} --`;
const PRODUCTION_DEPLOY_SCRIPT = `${PREFLIGHT_SCRIPT} && firebase deploy --only hosting --project ${PRODUCTION_PROJECT} --config firebase.production.json --`;
const HOSTING_IGNORE = [
  'firebase.json',
  'firebase.production.json',
  'firebase-debug*.log',
  'firestore-debug*.log',
  '**/.*',
  '.firebase/**',
  '.git/**',
  '.npm-cache/**',
  '**/node_modules/**',
  'CHANGELOG.md',
  'README.md',
  'docs/**',
  'firebase/**',
  'tests/**',
  'tools/**',
  'functions/**',
  'package.json',
  'package-lock.json',
  'playwright.config.js',
  'playwright-report/**',
  'test-results/**'
];
const FUNCTION_IGNORE = [
  '.git/**',
  '.firebase/**',
  '.npm-cache/**',
  'node_modules/**',
  'tests/**',
  'tools/**',
  'docs/**',
  'outputs/**',
  'firebase/**',
  'playwright-report/**',
  'test-results/**',
  'firebase-debug*.log',
  'firestore-debug*.log',
  '*.html',
  '*.png',
  '*.webmanifest',
  'sw.js',
  'js/ui/**'
];
const STAGING_REWRITES = [{
  source: '/api/staging-v2/authority-save',
  function: { functionId: 'stagingV2AuthoritySave', region: 'asia-east1' }
}];
const DOC_SCAN_EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.firebase', '.npm-cache', 'playwright-report', 'test-results']);

function fail(message) {
  throw new Error(`TARGET_CONFIG_INVALID: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail(`${label} must be a plain object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label} keys must be exact`);
}

function exactArray(value, expected, label) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) fail(`${label} must be exact`);
}

export function validateConfigValues({ firebaserc, firebaseConfig, productionConfig, packageConfig }) {
  exactKeys(firebaserc, ['projects'], '.firebaserc');
  exactKeys(firebaserc.projects, ['default', 'production', 'staging'], '.firebaserc.projects');
  if (firebaserc.projects.default !== PRODUCTION_PROJECT) fail('default project mismatch');
  if (firebaserc.projects.production !== PRODUCTION_PROJECT) fail('production project mismatch');
  if (firebaserc.projects.staging !== STAGING_PROJECT) fail('staging project mismatch');

  exactKeys(firebaseConfig, ['emulators', 'firestore', 'functions', 'hosting'], 'firebase.json');
  exactKeys(firebaseConfig.firestore, ['rules'], 'firebase.firestore');
  if (firebaseConfig.firestore.rules !== 'firebase/firestore.rules.deploy') fail('rules path mismatch');
  exactKeys(firebaseConfig.emulators, ['auth', 'firestore', 'singleProjectMode', 'ui'], 'firebase.emulators');
  exactKeys(firebaseConfig.emulators.auth, ['port'], 'firebase.emulators.auth');
  exactKeys(firebaseConfig.emulators.firestore, ['port'], 'firebase.emulators.firestore');
  exactKeys(firebaseConfig.emulators.ui, ['enabled'], 'firebase.emulators.ui');
  if (firebaseConfig.emulators.auth.port !== 9099 || firebaseConfig.emulators.firestore.port !== 8080 ||
      firebaseConfig.emulators.ui.enabled !== false || firebaseConfig.emulators.singleProjectMode !== true) {
    fail('emulator configuration mismatch');
  }
  exactKeys(firebaseConfig.functions, ['ignore', 'runtime', 'source'], 'firebase.functions');
  if (firebaseConfig.functions.source !== '.' || firebaseConfig.functions.runtime !== 'nodejs22') fail('functions target mismatch');
  exactArray(firebaseConfig.functions.ignore, FUNCTION_IGNORE, 'firebase.functions.ignore');
  exactKeys(firebaseConfig.hosting, ['ignore', 'public', 'rewrites'], 'firebase.hosting');
  if (firebaseConfig.hosting.public !== '.') fail('hosting public must be repo root');
  exactArray(firebaseConfig.hosting.ignore, HOSTING_IGNORE, 'firebase.hosting.ignore');
  exactArray(firebaseConfig.hosting.rewrites, STAGING_REWRITES, 'firebase.hosting.rewrites');

  exactKeys(productionConfig, ['hosting'], 'firebase.production.json');
  exactKeys(productionConfig.hosting, ['ignore', 'public'], 'production.hosting');
  if (productionConfig.hosting.public !== '.') fail('production hosting public must be repo root');
  exactArray(productionConfig.hosting.ignore, HOSTING_IGNORE, 'production.hosting.ignore');

  if (!isPlainObject(packageConfig) || !isPlainObject(packageConfig.scripts)) fail('package scripts missing');
  if (packageConfig.scripts['predeploy:staging'] !== PREFLIGHT_SCRIPT) fail('predeploy:staging mismatch');
  if (packageConfig.scripts['predeploy:production'] !== PREFLIGHT_SCRIPT) fail('predeploy:production mismatch');
  if (packageConfig.scripts['deploy:staging'] !== STAGING_DEPLOY_SCRIPT) fail('deploy:staging mismatch');
  if (packageConfig.scripts['deploy:production'] !== PRODUCTION_DEPLOY_SCRIPT) fail('production script changed');
  const lifecycleKeys = Object.keys(packageConfig.scripts).filter(key => /^(?:(?:pre|post)?deploy)(?::|$)/.test(key)).sort();
  if (JSON.stringify(lifecycleKeys) !== JSON.stringify(['deploy:production', 'deploy:staging', 'deploy:staging-rules', 'predeploy:production', 'predeploy:staging', 'predeploy:staging-rules'])) {
    fail('deploy lifecycle keys must be exact');
  }
  return true;
}

export function validateMarkdownText(source, relativePath = 'Markdown') {
  if (/\bfirebase\s+deploy\b/i.test(source)) fail(`${relativePath} contains a raw Firebase deploy command`);
  return true;
}

function validateRepositoryMarkdown(directory = ROOT, relativeDirectory = '') {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    fail(`${relativeDirectory || '.'} cannot be scanned`);
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!DOC_SCAN_EXCLUDED_DIRS.has(entry.name)) validateRepositoryMarkdown(absolutePath, relativePath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      validateMarkdownText(readFileSync(absolutePath, 'utf8'), relativePath);
    }
  }
}

function readExactJson(relativePath) {
  const path = join(ROOT, relativePath);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    fail(`${relativePath} missing`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${relativePath} must be a regular non-symlink file`);
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`${relativePath} is not valid JSON`);
  }
  if (!isPlainObject(value)) fail(`${relativePath} root must be a plain object`);
  return value;
}

export function validateRepository() {
  validateConfigValues({
    firebaserc: readExactJson('.firebaserc'),
    firebaseConfig: readExactJson('firebase.json'),
    productionConfig: readExactJson('firebase.production.json'),
    packageConfig: readExactJson('package.json')
  });
  validateRepositoryMarkdown();
  return true;
}

function isDirectExecution() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isDirectExecution()) {
  try {
    if (process.argv.length !== 2) fail('CLI arguments are forbidden');
    validateRepository();
    process.stdout.write('TARGET_CONFIG_VALID\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export const EXPECTED_STAGING_DEPLOY_SCRIPT = STAGING_DEPLOY_SCRIPT;
