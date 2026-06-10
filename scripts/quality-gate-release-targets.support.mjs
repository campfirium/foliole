/* global process */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-target.sh');

export function runTargetGate(cwd, target) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
      cwd,
      env: { ...process.env, QUALITY_GATE_LOG_MODE: 'summary' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export async function writePackageJson(rootDir, scripts) {
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-release-target-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

export function releaseScripts() {
  return {
    'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
    'lint:full': 'node -e "console.log(\'release lint ok\')"',
    'typecheck:desktop': 'node -e "console.log(\'release desktop typecheck ok\')"',
    'typecheck:android': 'node -e "console.log(\'release android typecheck ok\')"',
    'test:release:desktop-src': 'node -e "console.log(\'release desktop src test ok\')"',
    'test:desktop:electron': 'node -e "console.log(\'release desktop electron test ok\')"',
    'test:windows:core': 'node -e "console.log(\'release windows core test ok\')"',
    'test:windows:preview-recovery': 'node -e "console.log(\'release windows preview recovery test ok\')"',
    'test:release:android': 'node -e "console.log(\'release android test ok\')"',
    'test:release:shared': 'node -e "console.log(\'release shared test ok\')"',
    'test:quality:core': 'node -e "console.log(\'release quality core test ok\')"',
    'test:quality:gate': 'node -e "console.log(\'release quality gate test ok\')"',
    'test:quality:node': 'node -e "console.log(\'release quality node test ok\')"',
    'test:quality:preview': 'node -e "console.log(\'release quality preview test ok\')"',
    'build:vite-only': 'node -e "console.log(\'release vite build ok\')"',
    'electron:compile': 'node -e "console.log(\'release electron compile ok\')"',
    'android:web:build': 'node -e "console.log(\'release android web build ok\')"',
    'android:sync': 'node -e "console.log(\'release android sync ok\')"',
    'android:host:lint': 'node -e "console.log(\'release android host lint ok\')"',
    'android:host:test': 'node -e "console.log(\'release android host test ok\')"'
  };
}
