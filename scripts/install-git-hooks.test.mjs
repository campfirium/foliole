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
    const child = spawn('node', [SCRIPT_PATH], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env }
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

describe('install git hooks script', () => {
  it('skips cleanly when npm prepare runs outside a git worktree', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'install-hooks-test-'));
    try {
      const binDir = path.join(tempRoot, 'bin');
      const mockGit = path.join(binDir, 'git');
      await mkdir(binDir, { recursive: true });
      await writeFile(
        mockGit,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'if [[ "$1" == "rev-parse" ]]; then exit 128; fi',
          'exit 1'
        ].join('\n'),
        'utf8'
      );
      await chmod(mockGit, 0o755);

      const result = await runScript({ PATH: `${binDir}:${process.env.PATH ?? ''}` });

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
      const mockGit = path.join(binDir, 'git');
      await mkdir(binDir, { recursive: true });
      await writeFile(
        mockGit,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'printf "%s\\n" "$*" >> "${GIT_ARGS_LOG}"',
          'if [[ "$1" == "rev-parse" ]]; then echo true; exit 0; fi',
          'if [[ "$1" == "config" ]]; then exit 0; fi',
          'exit 1'
        ].join('\n'),
        'utf8'
      );
      await chmod(mockGit, 0o755);

      const result = await runScript({
        GIT_ARGS_LOG: argsLog,
        PATH: `${binDir}:${process.env.PATH ?? ''}`
      });

      expect(result.code).toBe(0);
      expect(await readFile(argsLog, 'utf8')).toContain('config core.hooksPath .githooks');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
