// @vitest-environment node
/* global process */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh');

function runQualityGate(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [QUALITY_GATE_FAST_SCRIPT], {
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
      resolve({ code, stderr, stdout });
    });
  });
}

async function writePackageJson(rootDir, scripts) {
  const packageJson = {
    name: 'quality-gate-fixture',
    private: true,
    scripts
  };
  await writeFile(path.join(rootDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

describe('quality-gate-fast.sh', () => {
  it('suppresses successful script output in fail-only mode', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'typecheck ok\')"',
        test: 'node -e "console.log(\'test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_LOG_MODE: 'fail-only'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] all checks passed.');
      expect(result.stdout).not.toContain('lint ok');
      expect(result.stdout).not.toContain('typecheck ok');
      expect(result.stdout).not.toContain('test ok');
      expect(result.stdout).not.toContain('running: lint');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('replays the failed script output in fail-only mode', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'typecheck failed details\'); process.exit(1)"',
        test: 'node -e "console.log(\'test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_LOG_MODE: 'fail-only'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate-fast] failed: typecheck');
      expect(result.stdout).toContain('typecheck failed details');
      expect(result.stdout).not.toContain('lint ok');
      expect(result.stdout).not.toContain('test ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
