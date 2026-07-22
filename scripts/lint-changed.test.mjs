// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT_CHANGED_SCRIPT = path.join(REPO_ROOT, 'scripts', 'lint-changed.mjs');

function runNode(args, cwd, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, env });
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

async function writeExecutable(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
}

const eslintFixture = (marker) => `import { writeFileSync } from 'node:fs';\nconst args = process.argv.slice(2).filter((arg) => !arg.endsWith('eslint.js'));\nwriteFileSync(${JSON.stringify(marker)}, args.join('\\n') + '\\n');\n`;

describe('lint-changed.mjs', () => {
  it('runs eslint only for lintable changed files', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
    const marker = path.join(tempRoot, 'eslint.args');
    try {
      spawnSync('git', ['init'], { cwd: tempRoot, stdio: 'ignore' });
      await writeExecutable(tempRoot, 'node_modules/eslint/bin/eslint.js', eslintFixture(marker));
      await mkdir(path.join(tempRoot, 'src'), { recursive: true });
      await writeFile(path.join(tempRoot, 'src/changed.ts'), 'export const value = 1;\n', 'utf8');
      await writeFile(path.join(tempRoot, 'README.md'), '# ignored\n', 'utf8');

      const result = await runNode([LINT_CHANGED_SCRIPT], tempRoot);

      expect(result.code).toBe(0);
      expect(await readFile(marker, 'utf8')).toBe('--cache\n--cache-location\n.tmp/eslint-cache/changed/\nsrc/changed.ts\n');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('accepts explicit lint targets without falling back to the repository', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
    const marker = path.join(tempRoot, 'eslint.args');
    try {
      await writeExecutable(tempRoot, 'node_modules/eslint/bin/eslint.js', eslintFixture(marker));

      const result = await runNode([LINT_CHANGED_SCRIPT, 'src/app/App.tsx', 'README.md'], tempRoot);

      expect(result.code).toBe(0);
      expect(await readFile(marker, 'utf8')).toBe('--cache\n--cache-location\n.tmp/eslint-cache/changed/\nsrc/app/App.tsx\n');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('accepts environment-provided lint targets before repository diff fallback', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
    const marker = path.join(tempRoot, 'eslint.args');
    try {
      await writeExecutable(tempRoot, 'git', '#!/usr/bin/env bash\nexit 88\n');
      await writeExecutable(tempRoot, 'node_modules/eslint/bin/eslint.js', eslintFixture(marker));

      const env = {
        ...process.env,
        LINT_CHANGED_FILES: 'src/app/App.tsx\nREADME.md\nsrc/shared/platform/runtime.ts',
        PATH: `${tempRoot}${path.delimiter}${process.env.PATH ?? ''}`
      };
      const result = await runNode([LINT_CHANGED_SCRIPT, '--scope', 'desktop'], tempRoot, env);

      expect(result.code).toBe(0);
      expect(await readFile(marker, 'utf8')).toBe(
        '--cache\n--cache-location\n.tmp/eslint-cache/changed/\nsrc/app/App.tsx\nsrc/shared/platform/runtime.ts\n'
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('ignores deleted tracked files when collecting changed targets', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
    try {
      spawnSync('git', ['init'], { cwd: tempRoot, stdio: 'ignore' });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempRoot, stdio: 'ignore' });
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tempRoot, stdio: 'ignore' });
      await writeExecutable(tempRoot, 'node_modules/eslint/bin/eslint.js', 'process.exit(99);\n');
      await mkdir(path.join(tempRoot, 'src'), { recursive: true });
      await writeFile(path.join(tempRoot, 'src/deleted.ts'), 'export const value = 1;\n', 'utf8');
      spawnSync('git', ['add', 'src/deleted.ts'], { cwd: tempRoot, stdio: 'ignore' });
      spawnSync('git', ['commit', '-m', 'add deleted fixture'], { cwd: tempRoot, stdio: 'ignore' });
      await rm(path.join(tempRoot, 'src/deleted.ts'));

      const result = await runNode([LINT_CHANGED_SCRIPT], tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[lint-changed] no lintable changed files detected');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('filters changed files by android scope', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
    const marker = path.join(tempRoot, 'eslint.args');
    try {
      await writeExecutable(tempRoot, 'node_modules/eslint/bin/eslint.js', eslintFixture(marker));

      const result = await runNode([
        LINT_CHANGED_SCRIPT,
        '--scope',
        'android',
        'src/companion/App.tsx',
        'src/app/App.tsx',
        'vite.companion.config.ts',
        'README.md'
      ], tempRoot);

      expect(result.code).toBe(0);
      expect(await readFile(marker, 'utf8')).toBe(
        '--cache\n--cache-location\n.tmp/eslint-cache/changed/\nsrc/companion/App.tsx\nvite.companion.config.ts\n'
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it('filters changed files by desktop and shared scopes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
    const marker = path.join(tempRoot, 'eslint.args');
    try {
      await writeExecutable(tempRoot, 'node_modules/eslint/bin/eslint.js', eslintFixture(marker));

      const desktopResult = await runNode([
        LINT_CHANGED_SCRIPT,
        '--scope',
        'desktop',
        'electron/main.ts',
        'src/companion/App.tsx',
        'src/shared/platform/runtime.ts'
      ], tempRoot);

      expect(desktopResult.code).toBe(0);
      expect(await readFile(marker, 'utf8')).toBe(
        '--cache\n--cache-location\n.tmp/eslint-cache/changed/\nelectron/main.ts\nsrc/shared/platform/runtime.ts\n'
      );

      const sharedResult = await runNode([
        LINT_CHANGED_SCRIPT,
        '--scope',
        'shared',
        'src/shared/platform/runtime.ts',
        'src/store/workspaceStore.ts',
        'src/companion/App.tsx',
        'scripts/quality/quality-gate-fast.test.mjs'
      ], tempRoot);

      expect(sharedResult.code).toBe(0);
      expect(await readFile(marker, 'utf8')).toBe(
        '--cache\n--cache-location\n.tmp/eslint-cache/changed/\nsrc/shared/platform/runtime.ts\nsrc/store/workspaceStore.ts\nscripts/quality/quality-gate-fast.test.mjs\n'
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it('fails closed when the shared path domain module cannot load', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
    try {
      const result = await runNode(
        [LINT_CHANGED_SCRIPT, '--scope', 'desktop', 'src/app/App.tsx'],
        tempRoot,
        { ...process.env, PATH_DOMAINS_SCRIPT: path.join(tempRoot, 'missing-path-domains.mjs') }
      );

      expect(result.code).not.toBe(0);
      expect(result.stdout).not.toContain('no lintable changed files');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15_000);
});
