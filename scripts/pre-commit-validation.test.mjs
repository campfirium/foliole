// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRE_COMMIT_VALIDATION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'pre-commit-validation.mjs');

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

async function createRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'pre-commit-validation-'));
  await runCommand('git', ['init'], repoDir);
  await runCommand('git', ['config', 'user.name', 'Precommit Test'], repoDir);
  await runCommand('git', ['config', 'user.email', 'precommit@example.com'], repoDir);
  await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
  await writeFile(path.join(repoDir, 'package.json'), JSON.stringify({
    scripts: {
      'test:sync-pack': 'node scripts/mock-sync-pack.mjs'
    }
  }), 'utf8');
  await writeFile(
    path.join(repoDir, 'scripts', 'mock-sync-pack.mjs'),
    'import { appendFileSync } from "node:fs"; appendFileSync("calls.log", "sync-pack\\n");\n',
    'utf8'
  );
  await writeFile(
    path.join(repoDir, 'scripts', 'check-file-budget.mjs'),
    'import { appendFileSync } from "node:fs"; appendFileSync("calls.log", `budget:${process.argv.slice(2).join(",")}\\n`);\n',
    'utf8'
  );
  await writeFile(
    path.join(repoDir, 'scripts', 'lint-changed.sh'),
    '#!/usr/bin/env bash\nprintf "lint:%s\\n" "$*" >> calls.log\n',
    { encoding: 'utf8', mode: 0o755 }
  );
  return repoDir;
}

describe('pre-commit validation', () => {
  it('runs sync-pack tests when staged sync-pack files changed', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'electron', 'database'), { recursive: true });
      await writeFile(path.join(repoDir, 'electron', 'database', 'syncPackBuilder.ts'), 'export const value = 1;\n');
      await runCommand('git', ['add', '.'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).toBe(0);
      expect(await readFile(path.join(repoDir, 'calls.log'), 'utf8')).toContain('sync-pack');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('runs budget and explicit lint only for added or renamed files', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'src'), { recursive: true });
      await writeFile(path.join(repoDir, 'src', 'new-file.ts'), 'export const value = 1;\n');
      await writeFile(path.join(repoDir, 'notes.md'), '# Notes\n');
      await runCommand('git', ['add', 'src/new-file.ts', 'notes.md'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).toBe(0);
      const calls = await readFile(path.join(repoDir, 'calls.log'), 'utf8');
      expect(calls).toContain('budget:notes.md,src/new-file.ts');
      expect(calls).toContain('lint:src/new-file.ts');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
