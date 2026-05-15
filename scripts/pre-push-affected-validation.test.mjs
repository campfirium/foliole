// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AFFECTED_VALIDATION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'pre-push-affected-validation.mjs');

function runCommand(command, args, cwd, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') {
        throw error;
      }
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
    child.stdin.end(options.input ?? '');
  });
}

async function createRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'pre-push-affected-'));
  await runCommand('git', ['init'], repoDir);
  await runCommand('git', ['config', 'user.name', 'Affected Test'], repoDir);
  await runCommand('git', ['config', 'user.email', 'affected@example.com'], repoDir);
  await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
  await writeFile(path.join(repoDir, 'package.json'), JSON.stringify({
    scripts: {
      'check:android-boundary': 'node scripts/mock-android-boundary.mjs',
      'test:sync-pack': 'node scripts/mock-sync-pack.mjs'
    }
  }), 'utf8');
  await writeFile(
    path.join(repoDir, 'scripts', 'mock-android-boundary.mjs'),
    'import { appendFileSync } from "node:fs"; appendFileSync("calls.log", "android-boundary\\n");\n',
    'utf8'
  );
  await writeFile(
    path.join(repoDir, 'scripts', 'mock-sync-pack.mjs'),
    'import { appendFileSync } from "node:fs"; appendFileSync("calls.log", "sync-pack\\n");\n',
    'utf8'
  );
  return repoDir;
}

async function commitAll(repoDir, message) {
  await runCommand('git', ['add', '.'], repoDir);
  await runCommand('git', ['commit', '-m', message], repoDir);
  return (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).stdout.trim();
}

describe('pre-push affected validation', () => {
  it('runs sync-pack tests when pushed commits affect sync-pack files', async () => {
    const repoDir = await createRepo();
    try {
      await writeFile(path.join(repoDir, 'README.md'), 'seed\n');
      const remoteSha = await commitAll(repoDir, '000001 seed');
      await mkdir(path.join(repoDir, 'electron', 'database'), { recursive: true });
      await writeFile(path.join(repoDir, 'electron', 'database', 'syncPackBuilder.ts'), 'export const value = 1;\n');
      const localSha = await commitAll(repoDir, '000002 sync pack');

      const result = await runCommand('node', [AFFECTED_VALIDATION_SCRIPT], repoDir, {
        input: `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`
      });

      expect(result.code).toBe(0);
      expect(await readFile(path.join(repoDir, 'calls.log'), 'utf8')).toContain('sync-pack');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('runs Android boundary checks when pushed commits affect Android sync Java', async () => {
    const repoDir = await createRepo();
    try {
      await writeFile(path.join(repoDir, 'README.md'), 'seed\n');
      const remoteSha = await commitAll(repoDir, '000001 seed');
      await mkdir(path.join(repoDir, 'android/app/src/main/java/com/foliole/android'), { recursive: true });
      await writeFile(
        path.join(repoDir, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncNodeVersionStore.java'),
        'final class FolioleCompanionSyncNodeVersionStore {}\n'
      );
      const localSha = await commitAll(repoDir, '000002 android sync');

      const result = await runCommand('node', [AFFECTED_VALIDATION_SCRIPT], repoDir, {
        input: `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`
      });

      expect(result.code).toBe(0);
      expect(await readFile(path.join(repoDir, 'calls.log'), 'utf8')).toContain('android-boundary');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
