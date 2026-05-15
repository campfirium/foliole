// @vitest-environment node
/* global process */

import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  for (const bucket of ['test:desktop', 'test:android', 'test:shared', 'test:sync-pack', 'test:quality']) {
    fixtureScripts[bucket] ??= scripts['test:full'];
  }
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-target-fixture', private: true, scripts: fixtureScripts }, null, 2)}\n`,
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

async function writeRepositoryRootBoundaryScript(rootDir, message = 'repository root boundary ok') {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(
    path.join(scriptsDir, 'check-repository-root-boundary.mjs'),
    `console.log('${message}')\n`,
    'utf8'
  );
}

async function writeCopyGuardScript(rootDir, message = 'copy guard ok') {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'check-ui-copy-guard.mjs'), `console.log('${message}')\n`, 'utf8');
}

describe('quality-gate-target.sh', () => {
  it('runs the desktop gate steps in order', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'copy:guard': 'node scripts/check-ui-copy-guard.mjs',
        'lint:desktop:full': 'node -e "console.log(\'desktop full lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'test:desktop': 'node -e "console.log(\'desktop test ok\')"',
        'test:quality': 'node -e "console.log(\'quality test ok\')"',
        build: 'node -e "console.log(\'desktop build ok\')"',
        'electron:compile': 'node -e "console.log(\'electron compile ok\')"'
      });
      await writeCopyGuardScript(tempRoot);
      await writeRepositoryRootBoundaryScript(tempRoot);
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'desktop');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('copy guard ok');
      expect(result.stdout).toContain('desktop full lint ok');
      expect(result.stdout).toContain('desktop typecheck ok');
      expect(result.stdout).toContain('desktop test ok');
      expect(result.stdout).toContain('quality test ok');
      expect(result.stdout).toContain('desktop build ok');
      expect(result.stdout).toContain('electron compile ok');
      expect(result.stdout).toContain('repository root boundary ok');
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
        'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
        'lint:android:full': 'node -e "console.log(\'android full lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'test:quality': 'node -e "console.log(\'quality test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'android');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('android full lint ok');
      expect(result.stdout).toContain('android typecheck ok');
      expect(result.stdout).toContain('android test ok');
      expect(result.stdout).toContain('quality test ok');
      expect(result.stdout).toContain('android sync ok');
      expect(result.stdout).toContain('android host lint ok');
      expect(result.stdout).toContain('android host test ok');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(result.stdout).toContain('android boundary ok');
      expect(result.stdout).toContain('[quality-gate:android] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('runs the android device gate including emulator and connected test', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:android:full': 'node -e "console.log(\'android full lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'test:quality': 'node -e "console.log(\'quality test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"',
        'android:emulator': 'node -e "console.log(\'android emulator ok\')"',
        'android:host:device-test': 'node -e "console.log(\'android connected test ok\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'android-device');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('android full lint ok');
      expect(result.stdout).toContain('android typecheck ok');
      expect(result.stdout).toContain('android test ok');
      expect(result.stdout).toContain('quality test ok');
      expect(result.stdout).toContain('android sync ok');
      expect(result.stdout).toContain('android host lint ok');
      expect(result.stdout).toContain('android host test ok');
      expect(result.stdout).toContain('android emulator ok');
      expect(result.stdout).toContain('android connected test ok');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(result.stdout).toContain('[quality-gate:android-device] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 30000);

  it('runs the shared gate without requiring android host test', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:shared:full': 'node -e "console.log(\'shared full lint ok\')"',
        'typecheck:shared': 'node -e "console.log(\'shared typecheck ok\')"',
        'test:shared': 'node -e "console.log(\'shared test ok\')"',
        'test:quality': 'node -e "console.log(\'quality test ok\')"',
        build: 'node -e "console.log(\'shared build ok\')"',
        'electron:compile': 'node -e "console.log(\'shared electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'shared android build ok\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'shared');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('shared full lint ok');
      expect(result.stdout).toContain('shared typecheck ok');
      expect(result.stdout).toContain('shared test ok');
      expect(result.stdout).toContain('quality test ok');
      expect(result.stdout).toContain('shared build ok');
      expect(result.stdout).toContain('shared electron compile ok');
      expect(result.stdout).toContain('shared android build ok');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(result.stdout).toContain('workspace boundary ok');
      expect(result.stdout).toContain('[quality-gate:shared] all checks passed.');
      expect(result.stdout).not.toContain('android sync ok');
      expect(result.stdout).not.toContain('android host lint ok');
      expect(result.stdout).not.toContain('android host test ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('runs the full gate without android host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'check:native-contracts': 'node -e "console.log(\'native contracts ok\')"',
        'check:reading-typography': 'node -e "console.log(\'reading typography ok\')"',
        'lint:full': 'node -e "console.log(\'full lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'full desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'full android typecheck ok\')"',
        'test:full': 'node -e "console.log(\'full deduped test ok\')"',
        build: 'node -e "console.log(\'full build ok\')"',
        'electron:compile': 'node -e "console.log(\'full electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'full android web build ok\')"',
        'android:sync': 'node -e "console.log(\'full android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'full android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'full android host test ok\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'full');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('full lint ok');
      expect(result.stdout).toContain('full desktop typecheck ok');
      expect(result.stdout).toContain('full android typecheck ok');
      expect(result.stdout).toContain('full deduped test ok');
      expect(result.stdout).toContain('full build ok');
      expect(result.stdout).toContain('native contracts ok');
      expect(result.stdout).toContain('reading typography ok');
      expect(result.stdout).toContain('[quality-gate:full] running in parallel: lint:full typecheck:desktop typecheck:android');
      expect(result.stdout).toContain('[quality-gate:full] running in parallel: build electron:compile android:web:build');
      expect(result.stdout).toContain('full electron compile ok');
      expect(result.stdout).toContain('full android web build ok');
      expect(result.stdout).not.toContain('full android sync ok');
      expect(result.stdout).not.toContain('full android host lint ok');
      expect(result.stdout).not.toContain('full android host test ok');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(result.stdout).toContain('workspace boundary ok');
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('runs the release gate including android host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:full': 'node -e "console.log(\'release lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'release desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'release android typecheck ok\')"',
        'test:full': 'node -e "console.log(\'release deduped test ok\')"',
        build: 'node -e "console.log(\'release build ok\')"',
        'electron:compile': 'node -e "console.log(\'release electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'release android web build ok\')"',
        'android:sync': 'node -e "console.log(\'release android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'release android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'release android host test ok\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'release');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release lint ok');
      expect(result.stdout).toContain('release desktop typecheck ok');
      expect(result.stdout).toContain('release android typecheck ok');
      expect(result.stdout).toContain('release deduped test ok');
      expect(result.stdout).toContain('release build ok');
      expect(result.stdout).toContain('[quality-gate:release] running in parallel: build electron:compile android:web:build');
      expect(result.stdout).toContain('release electron compile ok');
      expect(result.stdout).toContain('release android web build ok');
      expect(result.stdout).toContain('release android sync ok');
      expect(result.stdout).toContain('release android host lint ok');
      expect(result.stdout).toContain('release android host test ok');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(result.stdout).toContain('workspace boundary ok');
      expect(result.stdout).toContain('[quality-gate:release] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 30000);

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
  }, 30000);

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
  }, 30000);

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
  }, 30000);

  it('fails for an unknown target', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {});

      const result = await runTargetGate(tempRoot, 'unknown-target');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate-target] unknown target: unknown-target');
      expect(result.stdout).toContain('Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full|release>');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

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
  }, 15000);

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
  }, 15000);

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
  }, 15000);
});
