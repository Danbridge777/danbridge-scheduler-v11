import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cachedJavaHome = join(homedir(), '.cache', 'danbridge-rules-runtime', 'Contents', 'Home');
const configuredJavaHome = process.env.DANBRIDGE_JAVA_HOME || '';
const candidates = [configuredJavaHome, cachedJavaHome].filter(Boolean);
const javaHome = candidates.find(candidate => {
  try {
    accessSync(join(candidate, 'bin', 'java'), constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

if (!javaHome) {
  console.error('Firestore Rules 測試需要 Java 21。請設定 DANBRIDGE_JAVA_HOME，或安裝本機測試執行環境。');
  process.exit(1);
}

const firebaseBin = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
const command = [
  'emulators:exec',
  '--only', 'firestore,auth',
  '--project', 'danbridge-rules-test',
  'node tools/run_firestore_rules_and_v2_binder_tests.mjs'
];
const result = spawnSync(firebaseBin, command, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${join(javaHome, 'bin')}:${process.env.PATH || ''}`,
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true'
  },
  encoding: 'utf8',
  stdio: 'inherit'
});

if (result.error) {
  console.error(`無法啟動 Firestore Emulator：${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
