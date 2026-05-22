// @vitest-environment node
/* global process */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRE_COMMIT_VALIDATION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'pre-commit-validation.mjs');

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

async function createRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'pre-commit-windows-shell-'));
  await runCommand('git', ['init'], repoDir);
  await runCommand('git', ['config', 'user.name', 'Precommit Test'], repoDir);
  await runCommand('git', ['config', 'user.email', 'precommit@example.com'], repoDir);
  await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
  await writeFile(path.join(repoDir, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
  await writeFile(path.join(repoDir, 'scripts', 'check-file-budget.mjs'), 'process.exit(0);\n', 'utf8');
  await writeFile(path.join(repoDir, 'scripts', 'lint-changed.sh'), '#!/usr/bin/env bash\nexit 0\n', {
    encoding: 'utf8',
    mode: 0o755
  });
  await writeFile(path.join(repoDir, 'scripts', 'quality-critical-test-routes.mjs'), '\n', 'utf8');
  return repoDir;
}

describe('pre-commit Windows shell validation', () => {
  it('blocks fragile inline Windows shell commands from being staged', async () => {
    const repoDir = await createRepo();
    try {
      await writeFile(
        path.join(repoDir, 'package.json'),
        JSON.stringify({
          scripts: {
            'bad:preview': 'powershell.exe -NoProfile -Command "$env:FOO=\'bar\'; cmd.exe /c npm.cmd run electron:dev"'
          }
        }),
        'utf8'
      );
      await runCommand('git', ['add', 'package.json'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('windows shell policy violation');
      expect(result.stderr).toContain('package.json');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('does not block edits near legacy Windows shell commands unless the fragile command is newly added', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'scripts', 'windows'), { recursive: true });
      await writeFile(
        path.join(repoDir, 'scripts', 'windows', 'legacy-preview.sh'),
        [
          '#!/usr/bin/env bash',
          'powershell.exe -NoProfile -Command "$env:FOO=\'bar\'; npm.cmd run electron:dev"',
          ''
        ].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await runCommand('git', ['add', '.'], repoDir);
      await runCommand('git', ['commit', '-m', 'seed legacy script'], repoDir);
      await writeFile(
        path.join(repoDir, 'scripts', 'windows', 'legacy-preview.sh'),
        [
          '#!/usr/bin/env bash',
          '# unrelated maintenance note',
          'powershell.exe -NoProfile -Command "$env:FOO=\'bar\'; npm.cmd run electron:dev"',
          ''
        ].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await runCommand('git', ['add', 'scripts/windows/legacy-preview.sh'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code, result.stderr).toBe(0);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('allows Windows native wrappers that delegate to Node runners', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'scripts', 'windows'), { recursive: true });
      await writeFile(
        path.join(repoDir, 'package.json'),
        JSON.stringify({
          scripts: {
            'electron:dev:native': 'node scripts/windows/electron-dev-native.mjs'
          }
        }),
        'utf8'
      );
      await writeFile(
        path.join(repoDir, 'scripts', 'windows', 'electron-dev-native.mjs'),
        'process.env.FOLIOLE_USER_DATA_PATH ??= ".electron-user-data"; await import("../electron-dev.mjs");\n',
        'utf8'
      );
      await runCommand('git', ['add', 'package.json', 'scripts/windows/electron-dev-native.mjs'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).toBe(0);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('blocks Windows preview scripts that persist or default to a debug library copy', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'scripts', 'windows'), { recursive: true });
      await writeFile(
        path.join(repoDir, 'scripts', 'windows', 'electron-dev-native.mjs'),
        [
          "const debugLibraryHome = 'D:\\\\C\\\\foliole\\\\.electron-user-data\\\\native-debug-library';",
          "const settingsPath = 'library-path-settings.json';",
          "const shouldUseDebugCopy = process.env.FOLIOLE_USE_NATIVE_DEBUG_LIBRARY_COPY !== '0';",
          'const settings = { library_home: debugLibraryHome };',
          'console.log(settingsPath, shouldUseDebugCopy, settings);',
          ''
        ].join('\n'),
        'utf8'
      );
      await runCommand('git', ['add', 'scripts/windows/electron-dev-native.mjs'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('windows library path policy violation');
      expect(result.stderr).toContain('do not make the native debug library copy the default');
      expect(result.stderr).toContain('do not persist the native debug library as Library Home');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
