// @vitest-environment node

import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { runManagedCommand } from './quality-gate-fast.test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-fast.sh');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');
const QUALITY_GATE_INTEGRATION_TIMEOUT_MS = 240_000;

function runBash(args, cwd, env = {}) {
  return runManagedCommand('bash', args, {
    cwd,
    env,
    label: 'quality-gate-skip-lint',
    timeoutMs: QUALITY_GATE_INTEGRATION_TIMEOUT_MS
  });
}

async function writePackageJson(rootDir, scripts) {
  const fixtureScripts = {
    'deps:scan': 'node -e "console.log(\'dependency declarations ok\')"',
    ...scripts
  };
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-skip-lint-fixture', private: true, scripts: fixtureScripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeSkipLintScript(rootDir, body) {
  const scriptsDir = path.join(rootDir, 'scripts', 'quality');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'quality-skip-lint.mjs'), body, 'utf8');
  await writeFile(path.join(scriptsDir, 'quality-critical-test-routes.mjs'), 'process.exit(0);\n', 'utf8');
}

async function writeEslintShim(rootDir) {
  const eslintBinDir = path.join(rootDir, 'node_modules', 'eslint', 'bin');
  const eslintPath = path.join(eslintBinDir, 'eslint.js');
  await mkdir(eslintBinDir, { recursive: true });
  await writeFile(eslintPath, "console.log('eslint ok')\n", 'utf8');
  await chmod(eslintPath, 0o755);
}

describe('quality gate skip lint integration', () => {
  it('runs skip lint for skip-governance changes before quality-gate-fast completes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-skip-lint-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'typecheck ok\')"'
      });
      await writeSkipLintScript(tempRoot, "console.log('skip lint ok')\n");
      await writeEslintShim(tempRoot);

      const result = await runBash([FAST_SCRIPT], tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'scripts/quality/quality-skip-lint.mjs'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('skip lint ok');
      expect(result.stdout).toContain('[quality-gate-fast] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, QUALITY_GATE_INTEGRATION_TIMEOUT_MS);

  it('skips skip lint for source-only fast changes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-skip-lint-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'typecheck ok\')"'
      });
      await writeSkipLintScript(tempRoot, "console.error('skip lint should not run'); process.exit(1)\n");
      await writeEslintShim(tempRoot);

      const result = await runBash([FAST_SCRIPT], tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'src/example/example.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).not.toContain('skip lint should not run');
      expect(result.stdout).toContain('[quality-gate-fast] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, QUALITY_GATE_INTEGRATION_TIMEOUT_MS);

  it('blocks full target quality gates before target steps run', async () => {
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

      const result = await runBash([TARGET_SCRIPT, 'full'], tempRoot, {
        GITHUB_ACTIONS: 'true',
        RUNNER_ENVIRONMENT: 'github-hosted'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('skip lint failed');
      expect(result.stdout).not.toContain('desktop lint should not run');
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, QUALITY_GATE_INTEGRATION_TIMEOUT_MS);
});
