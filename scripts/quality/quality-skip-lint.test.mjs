// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_LINT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-skip-lint.mjs');

function runSkipLint(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [SKIP_LINT_SCRIPT], {
      cwd,
      env: { ...process.env, QUALITY_SKIP_LINT_TODAY: '2026-05-06', ...env }
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

async function writeTestFile(rootDir, source) {
  const filePath = path.join(rootDir, 'src', 'feature.test.ts');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, source, 'utf8');
  return filePath;
}

describe('quality-skip-lint.mjs', () => {
  it('accepts an adjacent SKIP comment for it.skip', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-skip-lint-'));
    try {
      await writeTestFile(
        tempRoot,
        [
          "import { it } from 'vitest';",
          '',
          '// SKIP: unrelated desktop fixture is broken | 2026-05-01 | revive: when fixture is rebuilt',
          "it.skip('loads fixture', () => {});"
        ].join('\n')
      );

      const result = await runSkipLint(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('checked 1 test file(s)');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects it.skip without an adjacent SKIP comment', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-skip-lint-'));
    try {
      await writeTestFile(tempRoot, ["import { it } from 'vitest';", "it.skip('loads fixture', () => {});"].join('\n'));

      const result = await runSkipLint(tempRoot);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('it.skip/test.skip requires adjacent SKIP comment');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects malformed SKIP comments', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-skip-lint-'));
    try {
      await writeTestFile(
        tempRoot,
        [
          "import { it } from 'vitest';",
          '// SKIP: missing revive | 2026-05-01',
          "it.skip('loads fixture', () => {});"
        ].join('\n')
      );

      const result = await runSkipLint(tempRoot);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('invalid SKIP comment format');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('warns but passes for stale SKIP comments', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-skip-lint-'));
    try {
      await writeTestFile(
        tempRoot,
        [
          "import { test } from 'vitest';",
          '// SKIP: old unrelated failure | 2026-03-01 | revive: when route is restored',
          "test.skip('loads fixture', () => {});"
        ].join('\n')
      );

      const result = await runSkipLint(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stderr).toContain('stale SKIP');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects unsupported skip forms', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-skip-lint-'));
    try {
      await writeTestFile(
        tempRoot,
        [
          "import { describe } from 'vitest';",
          '// SKIP: whole suite hidden | 2026-05-01 | revive: when suite is split',
          "describe.skip('suite', () => {});"
        ].join('\n')
      );

      const result = await runSkipLint(tempRoot);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('unsupported skip form for v1');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
