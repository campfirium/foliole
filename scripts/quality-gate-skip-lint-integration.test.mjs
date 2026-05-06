// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-target.sh');

function runBash(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('bash', args, { cwd, env: { ...process.env, QUALITY_GATE_LOG_MODE: 'summary' } });
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
    `${JSON.stringify({ name: 'quality-gate-skip-lint-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeSkipLintScript(rootDir, body) {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'quality-skip-lint.mjs'), body, 'utf8');
}

describe('quality gate skip lint integration', () => {
  it('runs skip lint before quality-gate-fast completes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-skip-lint-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'typecheck ok\')"'
      });
      await writeSkipLintScript(tempRoot, "console.log('skip lint ok')\n");

      const result = await runBash([FAST_SCRIPT], tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('skip lint ok');
      expect(result.stdout).toContain('[quality-gate-fast] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('blocks target quality gates before target steps run', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-skip-lint-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:desktop': 'node -e "console.log(\'desktop lint should not run\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck should not run\')"',
        'test:desktop': 'node -e "console.log(\'desktop test should not run\')"',
        build: 'node -e "console.log(\'build should not run\')"',
        'electron:compile': 'node -e "console.log(\'electron compile should not run\')"'
      });
      await writeSkipLintScript(tempRoot, "console.error('skip lint failed'); process.exit(1)\n");

      const result = await runBash([TARGET_SCRIPT, 'desktop'], tempRoot);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('skip lint failed');
      expect(result.stdout).not.toContain('desktop lint should not run');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
