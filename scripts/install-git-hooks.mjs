#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';

function runGit(args, options = {}) {
  const command = process.env.FOLIOLE_GIT_BIN || 'git';
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32' && /\.cmd$/iu.test(command),
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe']
  });
}

const insideWorkTree = runGit(['rev-parse', '--is-inside-work-tree']);

if (insideWorkTree.status !== 0 || insideWorkTree.stdout.trim() !== 'true') {
  console.log('[hooks] skipped: not in a git worktree');
  process.exit(0);
}

const existingHooksPath = runGit(['config', '--get', 'core.hooksPath']);

if (existingHooksPath.status === 0 && existingHooksPath.stdout.trim() === '.githooks') {
  console.log('[hooks] already configured');
  process.exit(0);
}

const result = runGit(['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
