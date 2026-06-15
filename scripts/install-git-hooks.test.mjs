// @vitest-environment node
/* global process */

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'install-git-hooks.mjs');

function runScript(env) {
  return new Promise((resolve) => {
    const nextEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
    const child = spawn('node', [SCRIPT_PATH], {
      cwd: REPO_ROOT,
      env: { ...nextEnv, ...env }
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

async function writeMockGit(binDir, posixLines, cmdLines) {
  const mockGit = path.join(binDir, 'git');
  await writeFile(mockGit, posixLines.join('\n'), 'utf8');
  await chmod(mockGit, 0o755);
  const mockGitCmd = path.join(binDir, 'git.cmd');
  await writeFile(mockGitCmd, cmdLines.join('\r\n'), 'utf8');
  return process.platform === 'win32' ? mockGitCmd : mockGit;
}

describe('install git hooks script', () => {
  it('skips cleanly when npm prepare runs outside a git worktree', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'install-hooks-test-'));
    try {
      const binDir = path.join(tempRoot, 'bin');
      await mkdir(binDir, { recursive: true });
      const mockGit = await writeMockGit(
        binDir,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'if [[ "$1" == "rev-parse" ]]; then exit 128; fi',
          'exit 1'
        ],
        [
          '@echo off',
          'if "%1"=="rev-parse" exit /b 128',
          'exit /b 1'
        ]
      );

      const result = await runScript({ FOLIOLE_GIT_BIN: mockGit });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('skipped: not in a git worktree');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('configures hooks when a git worktree is available', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'install-hooks-git-test-'));
    try {
      const binDir = path.join(tempRoot, 'bin');
      const argsLog = path.join(tempRoot, 'args.log');
      await mkdir(binDir, { recursive: true });
      const mockGit = await writeMockGit(
        binDir,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'printf "%s\\n" "$*" >> "${GIT_ARGS_LOG}"',
          'if [[ "$1" == "rev-parse" ]]; then echo true; exit 0; fi',
          'if [[ "$1" == "config" ]]; then exit 0; fi',
          'exit 1'
        ],
        [
          '@echo off',
          'echo %*>>"%GIT_ARGS_LOG%"',
          'if "%1"=="rev-parse" echo true& exit /b 0',
          'if "%1"=="config" exit /b 0',
          'exit /b 1'
        ]
      );

      const result = await runScript({
        FOLIOLE_GIT_BIN: mockGit,
        GIT_ARGS_LOG: argsLog
      });

      expect(result.code).toBe(0);
      expect(await readFile(argsLog, 'utf8')).toContain('config core.hooksPath .githooks');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
