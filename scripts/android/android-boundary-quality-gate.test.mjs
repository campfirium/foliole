// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-target.sh');
const GATE_ROUTING_TIMEOUT_MS = 60_000;

function runTargetGate(cwd, target) {
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
      resolve({ code, stderr, stdout });
    });
  });
}

async function writePackageJson(rootDir, scripts) {
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'android-boundary-gate-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeFixtureScript(rootDir, relativePath, message) {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `console.log('${message}')\n`, 'utf8');
}

const ANDROID_GATE_SCRIPTS = {
  'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
  'lint:android:full': 'node -e "console.log(\'android full lint ok\')"',
  'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
  'test:android': 'node -e "console.log(\'android test ok\')"',
  'test:quality': 'node -e "console.log(\'quality test ok\')"',
  'android:sync': 'node -e "console.log(\'android sync ok\')"',
  'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
  'android:host:test': 'node -e "console.log(\'android host test ok\')"'
};

const SHARED_GATE_SCRIPTS = {
  'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
  'lint:shared:full': 'node -e "console.log(\'shared full lint ok\')"',
  'typecheck:shared': 'node -e "console.log(\'shared typecheck ok\')"',
  'test:shared': 'node -e "console.log(\'shared test ok\')"',
  'test:quality': 'node -e "console.log(\'quality test ok\')"',
  build: 'node -e "console.log(\'shared build ok\')"',
  'electron:compile': 'node -e "console.log(\'shared electron compile ok\')"',
  'android:web:build': 'node -e "console.log(\'shared android build ok\')"'
};

const FULL_GATE_SCRIPTS = {
  'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
  'copy:guard': 'node -e "console.log(\'copy guard ok\')"',
  'lint:full': 'node -e "console.log(\'full lint ok\')"',
  'typecheck:desktop': 'node -e "console.log(\'full desktop typecheck ok\')"',
  'typecheck:android': 'node -e "console.log(\'full android typecheck ok\')"',
  'test:release:desktop-src': 'node -e "console.log(\'full desktop src test ok\')"',
  'test:desktop:electron': 'node -e "console.log(\'full desktop electron test ok\')"',
  'test:windows:core': 'node -e "console.log(\'full windows core test ok\')"',
  'test:release:android': 'node -e "console.log(\'full android test ok\')"',
  'test:release:shared': 'node -e "console.log(\'full shared test ok\')"',
  'test:quality:core': 'node -e "console.log(\'full quality core test ok\')"',
  'test:quality:gate': 'node -e "console.log(\'full quality gate test ok\')"',
  'test:quality:node': 'node -e "console.log(\'full quality node test ok\')"',
  'test:quality:preview': 'node -e "console.log(\'full quality preview test ok\')"',
  'test:windows:preview-recovery': 'node -e "console.log(\'full preview recovery test ok\')"',
  'build:vite-only': 'node -e "console.log(\'full vite build ok\')"',
  'electron:compile': 'node -e "console.log(\'full electron compile ok\')"',
  'android:web:build': 'node -e "console.log(\'full android build ok\')"'
};

const RELEASE_GATE_SCRIPTS = {
  ...FULL_GATE_SCRIPTS,
  'lint:full': 'node -e "console.log(\'release lint ok\')"',
  'typecheck:desktop': 'node -e "console.log(\'release desktop typecheck ok\')"',
  'typecheck:android': 'node -e "console.log(\'release android typecheck ok\')"',
  'test:release:desktop-src': 'node -e "console.log(\'release desktop src test ok\')"',
  'test:desktop:electron': 'node -e "console.log(\'release desktop electron test ok\')"',
  'test:windows:core': 'node -e "console.log(\'release windows core test ok\')"',
  'test:release:android': 'node -e "console.log(\'release android test ok\')"',
  'test:release:shared': 'node -e "console.log(\'release shared test ok\')"',
  'test:quality:core': 'node -e "console.log(\'release quality core test ok\')"',
  'test:quality:gate': 'node -e "console.log(\'release quality gate test ok\')"',
  'test:quality:node': 'node -e "console.log(\'release quality node test ok\')"',
  'test:quality:preview': 'node -e "console.log(\'release quality preview test ok\')"',
  'test:windows:preview-recovery': 'node -e "console.log(\'release preview recovery test ok\')"',
  'build:vite-only': 'node -e "console.log(\'release vite build ok\')"',
  'electron:compile': 'node -e "console.log(\'release electron compile ok\')"',
  'android:web:build': 'node -e "console.log(\'release android build ok\')"',
  'android:sync': 'node -e "console.log(\'release android sync ok\')"',
  'android:host:lint': 'node -e "console.log(\'release android host lint ok\')"',
  'android:host:test': 'node -e "console.log(\'release android host test ok\')"'
};

describe('Android boundary quality gate routing', () => {
  it('runs the Android boundary check in the Android gate', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-boundary-gate-'));
    try {
      await writePackageJson(tempRoot, ANDROID_GATE_SCRIPTS);
      await writeFixtureScript(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'root boundary ok');

      const result = await runTargetGate(tempRoot, 'android');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('android boundary ok');
      expect(result.stdout.indexOf('android boundary ok')).toBeLessThan(result.stdout.indexOf('android full lint ok'));
      expect(result.stdout).toContain('[quality-gate:android] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, GATE_ROUTING_TIMEOUT_MS);

  it('runs the Android boundary check in the shared gate', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-boundary-gate-'));
    try {
      await writePackageJson(tempRoot, SHARED_GATE_SCRIPTS);
      await writeFixtureScript(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'root boundary ok');
      await writeFixtureScript(tempRoot, 'scripts/check-workspace-settings-boundary.mjs', 'workspace boundary ok');

      const result = await runTargetGate(tempRoot, 'shared');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('android boundary ok');
      expect(result.stdout.indexOf('android boundary ok')).toBeLessThan(result.stdout.indexOf('shared full lint ok'));
      expect(result.stdout).toContain('[quality-gate:shared] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, GATE_ROUTING_TIMEOUT_MS);

  it('runs the Android boundary check in the full gate', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-boundary-gate-'));
    try {
      await writePackageJson(tempRoot, FULL_GATE_SCRIPTS);
      await writeFixtureScript(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'root boundary ok');
      await writeFixtureScript(tempRoot, 'scripts/check-workspace-settings-boundary.mjs', 'workspace boundary ok');

      const result = await runTargetGate(tempRoot, 'full');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('android boundary ok');
      expect(result.stdout.indexOf('android boundary ok')).toBeLessThan(result.stdout.indexOf('full lint ok'));
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, GATE_ROUTING_TIMEOUT_MS);

  it('runs the Android boundary check in the release gate', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-boundary-gate-'));
    try {
      await writePackageJson(tempRoot, RELEASE_GATE_SCRIPTS);
      await writeFixtureScript(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'root boundary ok');
      await writeFixtureScript(tempRoot, 'scripts/check-workspace-settings-boundary.mjs', 'workspace boundary ok');

      const result = await runTargetGate(tempRoot, 'release');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('android boundary ok');
      expect(result.stdout.indexOf('android boundary ok')).toBeLessThan(result.stdout.indexOf('release lint ok'));
      expect(result.stdout).toContain('[quality-gate:release] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, GATE_ROUTING_TIMEOUT_MS);
});
