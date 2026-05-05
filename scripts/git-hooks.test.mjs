// @vitest-environment node

import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = path.join(REPO_ROOT, '.githooks', 'pre-commit');
const tempDirs = [];

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
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function createRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-hooks-'));
  tempDirs.push(repoDir);
  await runCommand('git', ['init'], repoDir);
  await runCommand('git', ['config', 'user.name', 'Hook Test'], repoDir);
  await runCommand('git', ['config', 'user.email', 'hooks@example.com'], repoDir);
  await mkdir(path.join(repoDir, '.githooks'), { recursive: true });
  await copyFile(HOOK_PATH, path.join(repoDir, '.githooks', 'pre-commit'));
  await chmod(path.join(repoDir, '.githooks', 'pre-commit'), 0o755);
  await runCommand('git', ['config', 'core.hooksPath', '.githooks'], repoDir);
  return repoDir;
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
    await expect(runCommand('git', ['commit', '-m', 'seed'], repoDir)).resolves.toMatchObject({ code: 0 });

    await mkdir(path.join(repoDir, '.lab'), { recursive: true });
    await writeFile(path.join(repoDir, '.lab', 'memo.md'), 'local memo\n');
    await runCommand('git', ['add', '-f', '.lab/memo.md'], repoDir);

    const result = await runCommand('git', ['commit', '-m', 'force lab file'], repoDir);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('refusing to commit .lab files');
    expect(result.stderr).toContain('.lab/memo.md');
  });
});
