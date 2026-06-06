// @vitest-environment node
/* global process */

import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
      env: { ...process.env, QUALITY_GATE_LOG_MODE: 'summary', ...env }
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
  const fixtureScripts = {
    'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
    ...scripts
  };
  for (const bucket of [
    'test:desktop',
    'test:desktop:src',
    'test:desktop:electron',
    'test:windows:core',
    'test:windows:preview-recovery',
    'test:android',
    'test:shared',
    'test:sync-pack',
    'test:quality',
    'test:quality:core',
    'test:quality:gate',
    'test:quality:node',
    'test:quality:preview'
  ]) {
    fixtureScripts[bucket] ??= scripts['test:full'];
  }
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-target-failures-fixture', private: true, scripts: fixtureScripts }, null, 2)}\n`,
    'utf8'
  );
}

describe('quality-gate-target.sh failure reporting', () => {
  it('reports every failed parallel step', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:full': 'node -e "console.log(\'lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:full': 'node -e "console.log(\'test full ok\')"',
        build: 'node -e "console.log(\'build failed details\'); process.exit(1)"',
        'electron:compile': 'node -e "console.log(\'electron failed details\'); process.exit(1)"',
        'android:web:build': 'node -e "console.log(\'android web build ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'full');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:full] build failed:');
      expect(result.stdout).toContain('[quality-gate:full] electron:compile failed:');
      expect(result.stdout).toContain('build failed details');
      expect(result.stdout).toContain('electron failed details');
      expect(result.stdout).toContain('android web build ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('reports missing scripts from parallel steps', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:full': 'node -e "console.log(\'lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:full': 'node -e "console.log(\'test full ok\')"',
        build: 'node -e "console.log(\'build ok\')"',
        'android:web:build': 'node -e "console.log(\'android web build ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'full');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:full] electron:compile failed:');
      expect(result.stdout).toContain('[quality-gate:full] missing script: electron:compile');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('prints heartbeat while parallel steps are still running', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:full': 'node -e "console.log(\'lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:full': 'node -e "console.log(\'test full ok\')"',
        build: 'node -e "setTimeout(() => console.log(\'build ok\'), 2100)"',
        'electron:compile': 'node -e "setTimeout(() => console.log(\'electron ok\'), 2100)"',
        'android:web:build': 'node -e "setTimeout(() => console.log(\'android web ok\'), 2100)"'
      });

      const result = await runTargetGate(tempRoot, 'full', {
        QUALITY_GATE_PARALLEL_HEARTBEAT_SECONDS: '1'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate:full] still running in parallel:');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('fails for an unknown target', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {});

      const result = await runTargetGate(tempRoot, 'unknown-target');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate-target] unknown target: unknown-target');
      expect(result.stdout).toContain(
        'Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full|release|release-core|release-preview-recovery|release-android-host>'
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('fails when a required package script is missing', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:android:full': 'node -e "console.log(\'android full lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'test:quality': 'node -e "console.log(\'quality test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'android');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:android] missing script: android:host:lint');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('prints a compact failure excerpt instead of dumping the whole log', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:desktop:full': 'node -e "console.log(\'desktop full lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'test:desktop':
          'node -e "for (let i = 1; i <= 220; i += 1) console.log(\'test-line-\' + i); process.exit(1)"',
        build: 'node -e "console.log(\'desktop build ok\')"',
        'electron:compile': 'node -e "console.log(\'electron compile ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'desktop');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:desktop] failed: test:desktop');
      expect(result.stdout).toContain('showing first 20 and last 120 lines');
      expect(result.stdout).toContain('test-line-1');
      expect(result.stdout).toContain('test-line-220');
      expect(result.stdout).toContain('[quality-gate:desktop] ... output trimmed ...');
      expect(result.stdout).not.toContain('test-line-60');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps the full failure log on disk and prints its absolute path', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:desktop:full': 'node -e "console.log(\'desktop full lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'test:desktop': 'node -e "console.log(\'deep failure details\'); process.exit(1)"',
        build: 'node -e "console.log(\'desktop build ok\')"',
        'electron:compile': 'node -e "console.log(\'electron compile ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'desktop');
      const match = result.stdout.match(/\[quality-gate:desktop\] full log: (.+\.log)/);

      expect(result.code).toBe(1);
      expect(match).not.toBeNull();
      await access(match[1]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
