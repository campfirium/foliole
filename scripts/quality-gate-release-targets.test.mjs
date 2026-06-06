// @vitest-environment node
/* global process */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-target.sh');

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
      resolve({ code, stdout, stderr });
    });
  });
}

async function writePackageJson(rootDir, scripts) {
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-release-target-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

function releaseScripts() {
  return {
    'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
    'lint:full': 'node -e "console.log(\'release lint ok\')"',
    'typecheck:desktop': 'node -e "console.log(\'release desktop typecheck ok\')"',
    'typecheck:android': 'node -e "console.log(\'release android typecheck ok\')"',
    'test:desktop:src': 'node -e "console.log(\'release desktop src test ok\')"',
    'test:desktop:electron': 'node -e "console.log(\'release desktop electron test ok\')"',
    'test:windows:core': 'node -e "console.log(\'release windows core test ok\')"',
    'test:windows:preview-recovery': 'node -e "console.log(\'release windows preview recovery test ok\')"',
    'test:android': 'node -e "console.log(\'release android test ok\')"',
    'test:shared': 'node -e "console.log(\'release shared test ok\')"',
    'test:sync-pack': 'node -e "console.log(\'release sync-pack test ok\')"',
    'test:quality:core': 'node -e "console.log(\'release quality core test ok\')"',
    'test:quality:gate': 'node -e "console.log(\'release quality gate test ok\')"',
    'test:quality:node': 'node -e "console.log(\'release quality node test ok\')"',
    'test:quality:preview': 'node -e "console.log(\'release quality preview test ok\')"',
    build: 'node -e "console.log(\'release build ok\')"',
    'electron:compile': 'node -e "console.log(\'release electron compile ok\')"',
    'android:web:build': 'node -e "console.log(\'release android web build ok\')"',
    'android:sync': 'node -e "console.log(\'release android sync ok\')"',
    'android:host:lint': 'node -e "console.log(\'release android host lint ok\')"',
    'android:host:test': 'node -e "console.log(\'release android host test ok\')"'
  };
}

describe('quality-gate release split targets', () => {
  it('keeps release-core isolated from preview recovery and android host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release-core');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release desktop src test ok');
      expect(result.stdout).toContain('release desktop electron test ok');
      expect(result.stdout).toContain('release windows core test ok');
      expect(result.stdout).toContain('release android test ok');
      expect(result.stdout).toContain('release shared test ok');
      expect(result.stdout).toContain('release sync-pack test ok');
      expect(result.stdout).toContain('release quality core test ok');
      expect(result.stdout).toContain('release quality gate test ok');
      expect(result.stdout).toContain('release quality node test ok');
      expect(result.stdout).toContain('release quality preview test ok');
      expect(result.stdout).toContain(
        '[quality-gate:release-core] running in parallel: test:desktop:src test:desktop:electron test:windows:core test:android test:shared test:sync-pack test:quality:core test:quality:gate test:quality:node'
      );
      expect(result.stdout).not.toContain('release windows preview recovery test ok');
      expect(result.stdout).not.toContain('release android sync ok');
      expect(result.stdout).toContain('[quality-gate:release-core] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps release-preview-recovery isolated to slow Windows recovery tests', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release-preview-recovery');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release windows preview recovery test ok');
      expect(result.stdout).not.toContain('release desktop test ok');
      expect(result.stdout).not.toContain('release windows core test ok');
      expect(result.stdout).not.toContain('release android sync ok');
      expect(result.stdout).toContain('[quality-gate:release-preview-recovery] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps full isolated to release core plus preview recovery without android host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'full');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release lint ok');
      expect(result.stdout).toContain('release desktop typecheck ok');
      expect(result.stdout).toContain('release android typecheck ok');
      expect(result.stdout).toContain('release desktop src test ok');
      expect(result.stdout).toContain('release desktop electron test ok');
      expect(result.stdout).toContain('release windows core test ok');
      expect(result.stdout).toContain('release windows preview recovery test ok');
      expect(result.stdout).toContain('release android test ok');
      expect(result.stdout).toContain('release shared test ok');
      expect(result.stdout).toContain('release sync-pack test ok');
      expect(result.stdout).toContain('release quality core test ok');
      expect(result.stdout).toContain('release quality gate test ok');
      expect(result.stdout).toContain('release quality node test ok');
      expect(result.stdout).toContain('release quality preview test ok');
      expect(result.stdout).toContain('release build ok');
      expect(result.stdout).toContain('release electron compile ok');
      expect(result.stdout).toContain('release android web build ok');
      expect(result.stdout).not.toContain('release android sync ok');
      expect(result.stdout).not.toContain('release android host lint ok');
      expect(result.stdout).not.toContain('release android host test ok');
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps full release coverage as core plus preview recovery plus android host', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release windows core test ok');
      expect(result.stdout).toContain('release windows preview recovery test ok');
      expect(result.stdout).toContain('release android sync ok');
      expect(result.stdout).toContain('release android host lint ok');
      expect(result.stdout).toContain('release android host test ok');
      expect(result.stdout).toContain('[quality-gate:release] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps release-android-host isolated to sync and host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release-android-host');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release android sync ok');
      expect(result.stdout).toContain('release android host lint ok');
      expect(result.stdout).toContain('release android host test ok');
      expect(result.stdout).not.toContain('release lint ok');
      expect(result.stdout).not.toContain('release sync-pack test ok');
      expect(result.stdout).not.toContain('release android web build ok');
      expect(result.stdout).toContain('[quality-gate:release-android-host] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
