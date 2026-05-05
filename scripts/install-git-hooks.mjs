#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';

function runGit(args, options = {}) {
  return spawnSync('git', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe']
  });
}

const insideWorkTree = runGit(['rev-parse', '--is-inside-work-tree']);

if (insideWorkTree.status !== 0 || insideWorkTree.stdout.trim() !== 'true') {
  console.log('[hooks] skipped: not in a git worktree');
  process.exit(0);
}

const result = runGit(['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
