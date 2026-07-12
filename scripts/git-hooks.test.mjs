// @vitest-environment node
/* global process */

import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_NAMES = ['commit-msg', 'pre-commit', 'pre-push', 'prepare-commit-msg'];
const FILE_BUDGET_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'check-file-budget.mjs');
const AFFECTED_VALIDATION_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'pre-push-affected-validation.mjs');
const CRITICAL_TEST_ROUTES_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-critical-test-routes.mjs');
const SEQUENCE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'git', 'check-commit-sequence.mjs');
const PATH_DOMAINS_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'path-domains.mjs');
const PATH_DOMAIN_REGISTRY_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'path-domain-registry.mjs');
const HOOK_INTEGRATION_TIMEOUT_MS = 30_000;
const tempDirs = [];

function runCommand(command, args, cwd, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: options.env ?? process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

async function createRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-hooks-'));
  tempDirs.push(repoDir);
  await runCommand('git', ['init'], repoDir);
  await runCommand('git', ['config', 'user.name', 'Hook Test'], repoDir);
  await runCommand('git', ['config', 'user.email', 'hooks@example.com'], repoDir);
  await mkdir(path.join(repoDir, '.githooks'), { recursive: true });
  await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
  await mkdir(path.join(repoDir, 'scripts', 'git'), { recursive: true });
  await mkdir(path.join(repoDir, 'scripts', 'lib'), { recursive: true });
  await mkdir(path.join(repoDir, 'scripts', 'quality'), { recursive: true });
  await copyFile(SEQUENCE_SCRIPT_PATH, path.join(repoDir, 'scripts', 'git', 'check-commit-sequence.mjs'));
  await copyFile(FILE_BUDGET_SCRIPT_PATH, path.join(repoDir, 'scripts', 'check-file-budget.mjs'));
  await copyFile(AFFECTED_VALIDATION_SCRIPT_PATH, path.join(repoDir, 'scripts', 'pre-push-affected-validation.mjs'));
  await copyFile(CRITICAL_TEST_ROUTES_SCRIPT_PATH, path.join(repoDir, 'scripts', 'quality', 'quality-critical-test-routes.mjs'));
  await copyFile(PATH_DOMAINS_SCRIPT_PATH, path.join(repoDir, 'scripts', 'lib', 'path-domains.mjs'));
  await copyFile(PATH_DOMAIN_REGISTRY_PATH, path.join(repoDir, 'scripts', 'lib', 'path-domain-registry.mjs'));
  await chmod(path.join(repoDir, 'scripts', 'git', 'check-commit-sequence.mjs'), 0o755);
  await chmod(path.join(repoDir, 'scripts', 'pre-push-affected-validation.mjs'), 0o755);
  await writeFile(
    path.join(repoDir, 'scripts', 'lint-changed.mjs'),
    '#!/usr/bin/env bash\nexit 0\n',
    { encoding: 'utf8', mode: 0o755 }
  );
  await Promise.all(
    HOOK_NAMES.map(async (name) => {
      const hookPath = path.join(repoDir, '.githooks', name);
      await copyFile(path.join(REPO_ROOT, '.githooks', name), hookPath);
      await chmod(hookPath, 0o755);
    })
  );
  await runCommand('git', ['config', 'core.hooksPath', '.githooks'], repoDir);
  return repoDir;
}

async function commitFile(repoDir, file, body, message) {
  await writeFile(path.join(repoDir, file), body);
  await runCommand('git', ['add', file], repoDir);
  return runCommand('git', ['commit', '-m', message], repoDir);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('git hooks', () => {
  it('blocks forced .lab files from entering commits', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, '.gitignore'), '.lab/\n');
    await writeFile(path.join(repoDir, 'tracked.txt'), 'seed\n');
    await runCommand('git', ['add', '.gitignore', 'tracked.txt'], repoDir);
    await expect(runCommand('git', ['commit', '-m', '000001 seed'], repoDir)).resolves.toMatchObject({ code: 0 });

    await mkdir(path.join(repoDir, '.lab'), { recursive: true });
    await writeFile(path.join(repoDir, '.lab', 'memo.md'), 'local memo\n');
    await runCommand('git', ['add', '-f', '.lab/memo.md'], repoDir);

    const result = await runCommand('git', ['commit', '-m', 'force lab file'], repoDir);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('refusing to commit .lab files');
    expect(result.stderr).toContain('.lab/memo.md');
  }, HOOK_INTEGRATION_TIMEOUT_MS);

  it('keeps pre-commit limited to the local lab guard', async () => {
    const repoDir = await createRepo();

    const result = await commitFile(repoDir, 'tracked.txt', 'content\n', '000001 seed');

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).not.toContain('pre-commit-validation');
  }, HOOK_INTEGRATION_TIMEOUT_MS);

  it('blocks commit messages that skip the next sequence', async () => {
    const repoDir = await createRepo();
    await expect(commitFile(repoDir, 'a.txt', 'a\n', '000001 seed')).resolves.toMatchObject({ code: 0 });

    const result = await commitFile(repoDir, 'b.txt', 'b\n', '000003 skip');

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('commit subject must start with next sequence 000002');
  }, HOOK_INTEGRATION_TIMEOUT_MS);

  it('keeps the existing sequence when amending a commit', async () => {
    const repoDir = await createRepo();
    await expect(commitFile(repoDir, 'a.txt', 'a\n', '000001 seed')).resolves.toMatchObject({ code: 0 });
    await writeFile(path.join(repoDir, 'a.txt'), 'amended\n');
    await runCommand('git', ['add', 'a.txt'], repoDir);

    const result = await runCommand('git', ['commit', '--amend', '--no-edit'], repoDir);

    expect(result.code, result.stderr).toBe(0);
    expect((await runCommand('git', ['log', '-1', '--pretty=%s'], repoDir)).stdout.trim()).toBe('000001 seed');
  }, HOOK_INTEGRATION_TIMEOUT_MS);

  it('blocks branch pushes with non-continuous numbered history', async () => {
    const repoDir = await createRepo();
    await expect(commitFile(repoDir, 'a.txt', 'a\n', '000001 seed')).resolves.toMatchObject({ code: 0 });
    await writeFile(path.join(repoDir, 'b.txt'), 'b\n');
    await runCommand('git', ['add', 'b.txt'], repoDir);
    await runCommand('git', ['commit', '--no-verify', '-m', '000003 skip'], repoDir);

    const head = (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).stdout.trim();
    const hook = path.join(repoDir, '.githooks', 'pre-push');
    const result = await runCommand('bash', [hook], repoDir, {
      input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('sequence must be 000002');
  }, HOOK_INTEGRATION_TIMEOUT_MS);

  it('blocks branch pushes with unnumbered new commit subjects', async () => {
    const repoDir = await createRepo();
    await expect(commitFile(repoDir, 'a.txt', 'a\n', '000001 seed')).resolves.toMatchObject({ code: 0 });
    await writeFile(path.join(repoDir, 'b.txt'), 'b\n');
    await runCommand('git', ['add', 'b.txt'], repoDir);
    await runCommand('git', ['commit', '--no-verify', '-m', 'missing number'], repoDir);

    const head = (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).stdout.trim();
    const hook = path.join(repoDir, '.githooks', 'pre-push');
    const result = await runCommand('bash', [hook], repoDir, {
      input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('contains an unnumbered commit subject');
  }, HOOK_INTEGRATION_TIMEOUT_MS);

  it('checks only new commit subjects for existing branch pushes', async () => {
    const repoDir = await createRepo();
    await expect(commitFile(repoDir, 'a.txt', 'a\n', '000001 seed')).resolves.toMatchObject({ code: 0 });
    await writeFile(path.join(repoDir, 'remote.txt'), 'remote\n');
    await runCommand('git', ['add', 'remote.txt'], repoDir);
    await runCommand('git', ['commit', '--no-verify', '-m', 'remote merge without local sequence'], repoDir);
    const remoteSha = (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).stdout.trim();
    await expect(commitFile(repoDir, 'b.txt', 'b\n', '000002 local change')).resolves.toMatchObject({ code: 0 });

    const head = (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).stdout.trim();
    const hook = path.join(repoDir, '.githooks', 'pre-push');
    const result = await runCommand('bash', [hook], repoDir, {
      input: `refs/heads/main ${head} refs/heads/main ${remoteSha}\n`
    });

    expect(result.code, result.stderr).toBe(0);
  }, HOOK_INTEGRATION_TIMEOUT_MS);
  it('does not depend on an external cat binary in pre-push', async () => {
    const repoDir = await createRepo();
    await expect(commitFile(repoDir, 'a.txt', 'a\n', '000001 seed')).resolves.toMatchObject({ code: 0 });
    const fakeBin = path.join(repoDir, 'fake-bin');
    await mkdir(fakeBin, { recursive: true });
    await writeFile(path.join(fakeBin, 'cat'), '#!/usr/bin/env bash\necho BAD_CAT_USED >&2\nexit 126\n', { mode: 0o755 });

    const head = (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).stdout.trim();
    const hook = path.join(repoDir, '.githooks', 'pre-push');
    const result = await runCommand('bash', [hook], repoDir, {
      env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` },
      input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).not.toContain('BAD_CAT_USED');
  }, HOOK_INTEGRATION_TIMEOUT_MS);

  it('routes sync-pack affected checks through pre-push', async () => {
    const repoDir = await createRepo();
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
    await expect(commitFile(repoDir, 'a.txt', 'a\n', '000001 seed')).resolves.toMatchObject({ code: 0 });
    await mkdir(path.join(repoDir, 'electron', 'database'), { recursive: true });
    await expect(commitFile(
      repoDir,
      'electron/database/syncPackBuilder.ts',
      'export const value = 1;\n',
      '000002 sync pack'
    )).resolves.toMatchObject({ code: 0 });

    const head = (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).stdout.trim();
    const hook = path.join(repoDir, '.githooks', 'pre-push');
    const result = await runCommand('bash', [hook], repoDir, {
      input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`
    });

    expect(result.code).toBe(0);
    expect(await readFile(path.join(repoDir, 'calls.log'), 'utf8')).toContain('sync-pack');
  }, HOOK_INTEGRATION_TIMEOUT_MS);
});
