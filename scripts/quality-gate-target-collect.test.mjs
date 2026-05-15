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
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-collect-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeRepositoryRootBoundaryScript(rootDir, message = 'repository boundary ok') {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'check-repository-root-boundary.mjs'), `console.log('${message}')\n`, 'utf8');
}

describe('quality-gate-target.sh collected failure mode', () => {
  it('continues sequential desktop steps and reports all failures at the end', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-collect-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:desktop:full': 'node -e "console.log(\'lint failed details\'); process.exit(1)"',
        'typecheck:desktop': 'node -e "console.log(\'typecheck failed details\'); process.exit(1)"',
        'test:desktop': 'node -e "console.log(\'desktop test still ran\')"',
        'test:quality': 'node -e "console.log(\'quality test still ran\')"',
        build: 'node -e "console.log(\'build still ran\')"',
        'electron:compile': 'node -e "console.log(\'electron compile still ran\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'desktop');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:desktop] failed: lint:desktop:full');
      expect(result.stdout).toContain('[quality-gate:desktop] failed: typecheck:desktop');
      expect(result.stdout).toContain('desktop test still ran');
      expect(result.stdout).toContain('build still ran');
      expect(result.stdout).toContain('[quality-gate:desktop] collected failures summary:');
      expect(result.stdout).not.toContain('[quality-gate:desktop] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('continues after a failed parallel group and keeps later full-gate steps visible', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-collect-'));
    try {
      await writePackageJson(tempRoot, {
        'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
        'lint:full': 'node -e "console.log(\'lint failed details\'); process.exit(1)"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck failed details\'); process.exit(1)"',
        'test:desktop': 'node -e "console.log(\'desktop test still ran\')"',
        'test:android': 'node -e "console.log(\'android test still ran\')"',
        'test:shared': 'node -e "console.log(\'shared test still ran\')"',
        'test:sync-pack': 'node -e "console.log(\'sync pack test still ran\')"',
        'test:quality': 'node -e "console.log(\'quality test still ran\')"',
        build: 'node -e "console.log(\'build still ran\')"',
        'electron:compile': 'node -e "console.log(\'electron compile failed details\'); process.exit(1)"',
        'android:web:build': 'node -e "console.log(\'android web build still ran\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'full');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:full] lint:full failed:');
      expect(result.stdout).toContain('[quality-gate:full] typecheck:android failed:');
      expect(result.stdout).toContain('desktop test still ran');
      expect(result.stdout).toContain('android test still ran');
      expect(result.stdout).toContain('shared test still ran');
      expect(result.stdout).toContain('sync pack test still ran');
      expect(result.stdout).toContain('quality test still ran');
      expect(result.stdout).toContain('android web build still ran');
      expect(result.stdout).toContain('[quality-gate:full] electron:compile failed:');
      expect(result.stdout).toContain('[quality-gate:full] collected failures summary:');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 30000);
});
