// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-target.sh');

function runTargetGate(cwd, target, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
      cwd,
      env: { ...process.env, ...env }
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
    `${JSON.stringify({ name: 'quality-gate-target-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeWorkspaceBoundaryScript(rootDir, message = 'workspace boundary ok') {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(
    path.join(scriptsDir, 'check-workspace-settings-boundary.mjs'),
    `console.log('${message}')\n`,
    'utf8'
  );
}

describe('quality-gate-target.sh', () => {
  it('runs the desktop gate steps in order', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:desktop': 'node -e "console.log(\'desktop lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'test:desktop': 'node -e "console.log(\'desktop test ok\')"',
        build: 'node -e "console.log(\'desktop build ok\')"',
        'electron:compile': 'node -e "console.log(\'electron compile ok\')"'
      });
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'desktop');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('desktop lint ok');
      expect(result.stdout).toContain('desktop typecheck ok');
      expect(result.stdout).toContain('desktop test ok');
      expect(result.stdout).toContain('desktop build ok');
      expect(result.stdout).toContain('electron compile ok');
      expect(result.stdout).toContain('workspace boundary ok');
      expect(result.stdout).toContain('[quality-gate:desktop] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('runs the android gate including host test', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:android': 'node -e "console.log(\'android lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'android');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('android lint ok');
      expect(result.stdout).toContain('android typecheck ok');
      expect(result.stdout).toContain('android test ok');
      expect(result.stdout).toContain('android sync ok');
      expect(result.stdout).toContain('android host lint ok');
      expect(result.stdout).toContain('android host test ok');
      expect(result.stdout).toContain('[quality-gate:android] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('runs the android device gate including emulator and connected test', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:android': 'node -e "console.log(\'android lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"',
        'android:emulator': 'node -e "console.log(\'android emulator ok\')"',
        'android:host:device-test': 'node -e "console.log(\'android connected test ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'android-device');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('android lint ok');
      expect(result.stdout).toContain('android typecheck ok');
      expect(result.stdout).toContain('android test ok');
      expect(result.stdout).toContain('android sync ok');
      expect(result.stdout).toContain('android host lint ok');
      expect(result.stdout).toContain('android host test ok');
      expect(result.stdout).toContain('android emulator ok');
      expect(result.stdout).toContain('android connected test ok');
      expect(result.stdout).toContain('[quality-gate:android-device] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('runs the shared gate without requiring android host test', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:shared': 'node -e "console.log(\'shared lint ok\')"',
        'typecheck:shared': 'node -e "console.log(\'shared typecheck ok\')"',
        'test:shared': 'node -e "console.log(\'shared test ok\')"',
        build: 'node -e "console.log(\'shared build ok\')"',
        'electron:compile': 'node -e "console.log(\'shared electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'shared android build ok\')"'
      });
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'shared');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('shared lint ok');
      expect(result.stdout).toContain('shared typecheck ok');
      expect(result.stdout).toContain('shared test ok');
      expect(result.stdout).toContain('shared build ok');
      expect(result.stdout).toContain('shared electron compile ok');
      expect(result.stdout).toContain('shared android build ok');
      expect(result.stdout).toContain('workspace boundary ok');
      expect(result.stdout).toContain('[quality-gate:shared] all checks passed.');
      expect(result.stdout).not.toContain('android sync ok');
      expect(result.stdout).not.toContain('android host lint ok');
      expect(result.stdout).not.toContain('android host test ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('runs the full gate including android host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'full lint ok\')"',
        typecheck: 'node -e "console.log(\'full typecheck ok\')"',
        test: 'node -e "console.log(\'full test ok\')"',
        build: 'node -e "console.log(\'full build ok\')"',
        'electron:compile': 'node -e "console.log(\'full electron compile ok\')"',
        'android:sync': 'node -e "console.log(\'full android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'full android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'full android host test ok\')"'
      });
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'full');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('full lint ok');
      expect(result.stdout).toContain('full typecheck ok');
      expect(result.stdout).toContain('full test ok');
      expect(result.stdout).toContain('full build ok');
      expect(result.stdout).toContain('full electron compile ok');
      expect(result.stdout).toContain('full android sync ok');
      expect(result.stdout).toContain('full android host lint ok');
      expect(result.stdout).toContain('full android host test ok');
      expect(result.stdout).toContain('workspace boundary ok');
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('fails for an unknown target', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {});

      const result = await runTargetGate(tempRoot, 'unknown-target');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate-target] unknown target: unknown-target');
      expect(result.stdout).toContain('Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full>');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('fails when a required package script is missing', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:android': 'node -e "console.log(\'android lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'android');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:android] missing script: android:host:lint');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
