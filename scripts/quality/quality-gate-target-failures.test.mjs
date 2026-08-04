// @vitest-environment node
/* global process */

import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');
const FAILURE_REPORT_TIMEOUT_MS = 180000;

vi.setConfig({ testTimeout: FAILURE_REPORT_TIMEOUT_MS });
const ok = (message) => `printf '%s\\n' '${message}'`;
const fail = (message) => `printf '%s\\n' '${message}'; exit 1`;
const delayOk = (message) => `sleep 2.1; printf '%s\\n' '${message}'`;

function runTargetGate(cwd, target, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
      cwd,
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        QUALITY_GATE_LOG_MODE: 'summary',
        RUNNER_ENVIRONMENT: 'github-hosted',
        ...env
      }
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

function toNodePath(filePath) {
  if (process.platform !== 'win32') {
    return filePath;
  }
  const result = spawnSync('bash', ['-lc', 'cygpath -w "$FOLIOLE_TEST_PATH"'], {
    encoding: 'utf8',
    env: { ...process.env, FOLIOLE_TEST_PATH: filePath }
  });
  if (result.status !== 0) {
    return filePath;
  }
  return result.stdout.trim() || filePath;
}

async function writePackageJson(rootDir, scripts) {
  const fixtureScripts = {
    'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
    ...scripts
  };
  for (const bucket of [
    'test:desktop',
    'test:release:desktop-src',
    'test:desktop:electron',
    'test:windows:core',
    'test:windows:native-preview',
    'test:release:android',
    'test:release:shared',
    'test:quality',
    'test:quality:core',
    'test:quality:gate',
    'test:quality:gate-integration',
    'test:quality:gate-integration:routing',
    'test:quality:gate-integration:fast-delegation',
    'test:quality:gate-integration:targets',
    'test:quality:gate-integration:target-core',
    'test:quality:gate-integration:target-failures',
    'test:quality:gate-integration:target-collect',
    'test:quality:gate-integration:target-telemetry',
    'test:quality:gate-integration:release-targets',
    'test:quality:gate-integration:release-tail',
    'test:quality:node',
    'test:quality:preview'
  ]) {
    fixtureScripts[bucket] ??= scripts['test:full'] ?? ok('bucket ok');
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
        'lint:full': ok('lint ok'),
        'typecheck:desktop': ok('desktop typecheck ok'),
        'typecheck:android': ok('android typecheck ok'),
        'test:full': ok('test full ok'),
        'build:vite-only': fail('build failed details'),
        'electron:compile': fail('electron failed details'),
        'android:web:build': ok('android web build ok')
      });

      const result = await runTargetGate(tempRoot, 'release-build');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:release-build] build:vite-only failed:');
      expect(result.stdout).toContain('[quality-gate:release-build] electron:compile failed:');
      expect(result.stdout).toContain('build failed details');
      expect(result.stdout).toContain('electron failed details');
      expect(result.stdout).toContain('android web build ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, FAILURE_REPORT_TIMEOUT_MS);

  it('reports missing scripts from parallel steps', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:full': ok('lint ok'),
        'typecheck:desktop': ok('desktop typecheck ok'),
        'typecheck:android': ok('android typecheck ok'),
        'test:full': ok('test full ok'),
        'build:vite-only': ok('build ok'),
        'android:web:build': ok('android web build ok')
      });

      const result = await runTargetGate(tempRoot, 'release-build');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:release-build] electron:compile failed:');
      expect(result.stdout).toContain('[quality-gate:release-build] missing script: electron:compile');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, FAILURE_REPORT_TIMEOUT_MS);

  it('prints heartbeat while parallel steps are still running', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:full': ok('lint ok'),
        'typecheck:desktop': ok('desktop typecheck ok'),
        'typecheck:android': ok('android typecheck ok'),
        'test:full': ok('test full ok'),
        'build:vite-only': delayOk('build ok'),
        'electron:compile': delayOk('electron ok'),
        'android:web:build': delayOk('android web ok')
      });

      const result = await runTargetGate(tempRoot, 'release-build', {
        QUALITY_GATE_PARALLEL_HEARTBEAT_SECONDS: '1'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate:release-build] still running in parallel:');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, FAILURE_REPORT_TIMEOUT_MS);

  it('fails for an unknown target', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {});

      const result = await runTargetGate(tempRoot, 'unknown-target');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate-target] unknown target: unknown-target');
      expect(result.stdout).toContain(
        'Usage: bash scripts/quality/quality-gate-target.sh <desktop|desktop-static|android|shared|shared-static|shared-test|shared-quality-tests|shared-build|full|release|release-core|release-hosted-common|release-hosted-common-build|release-windows-core|release-static|release-tests|release-build|release-script-preview|release-base|release-windows-tail|release-android-tail|release-ios-tail|release-tooling|release-preview-recovery|release-android-host>'
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, FAILURE_REPORT_TIMEOUT_MS);

  it('fails when a required package script is missing', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:android:full': ok('android full lint ok'),
        'typecheck:android': ok('android typecheck ok'),
        'test:android': ok('android test ok'),
        'test:quality': ok('quality test ok'),
        'android:sync': ok('android sync ok'),
        'android:host:test': ok('android host test ok')
      });

      const result = await runTargetGate(tempRoot, 'android');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:android] missing script: android:host:lint');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, FAILURE_REPORT_TIMEOUT_MS);

  it('prints a compact failure excerpt instead of dumping the whole log', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:desktop:full': ok('desktop full lint ok'),
        'typecheck:desktop': ok('desktop typecheck ok'),
        'test:desktop':
          'for i in $(seq 1 220); do printf "test-line-%s\\n" "$i"; done; exit 1',
        build: ok('desktop build ok'),
        'electron:compile': ok('electron compile ok')
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
  }, FAILURE_REPORT_TIMEOUT_MS);

  it('keeps the full failure log on disk and prints its absolute path', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:desktop:full': ok('desktop full lint ok'),
        'typecheck:desktop': ok('desktop typecheck ok'),
        'test:desktop': fail('deep failure details'),
        build: ok('desktop build ok'),
        'electron:compile': ok('electron compile ok')
      });

      const result = await runTargetGate(tempRoot, 'desktop');
      const match = result.stdout.match(/\[quality-gate:desktop\] full log: (.+\.log)/);

      expect(result.code).toBe(1);
      expect(match).not.toBeNull();
      await access(toNodePath(match[1]));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, FAILURE_REPORT_TIMEOUT_MS);
});
