#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';

const PULL_TIMEOUT_MS = 5 * 60_000;

function failure(message, exitCode, stage, result) {
  return Object.assign(new Error(message), { exitCode, result, stage });
}

async function checked(execute, paths, args, stage) {
  const result = await execute(paths.gitPath, ['-C', paths.repoRoot, ...args], {
    cwd: paths.repoRoot, timeoutCode: `${stage}_timeout`, timeoutMs: PULL_TIMEOUT_MS,
    windowsHide: true
  });
  if (result.code === 0) return result;
  const detail = result.lines?.at(-1) || result.stderr || `git ${args[0]} exited ${result.code}`;
  throw failure(String(detail).trim(), 64, stage, result);
}

export async function runWindowsDevPull({
  execute = executeBounded, fsApi = fs, paths = windowsDevPaths(), platform = process.platform
} = {}) {
  try {
    if (platform !== 'win32') throw failure('Windows DEV pull requires Windows', 64, 'platform');
    if (!fsApi.existsSync(paths.gitPath)) throw failure(`Required tool is missing: ${paths.gitPath}`, 64, 'preflight');
    const topLevel = (await checked(execute, paths, ['rev-parse', '--show-toplevel'], 'repo')).stdout.trim();
    const actual = fsApi.realpathSync.native(topLevel);
    const expected = fsApi.realpathSync.native(paths.repoRoot);
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      throw failure('Windows DEV script and Git top-level differ', 64, 'repo');
    }
    const branch = (await checked(execute, paths, ['branch', '--show-current'], 'repo')).stdout.trim();
    if (branch !== 'dev') throw failure('Windows DEV repository must stay on dev', 64, 'repo');
    await checked(execute, paths, ['fetch', '--no-tags', paths.bareRepository, 'dev'], 'fetch');
    const aligned = await checked(execute, paths, ['reset', '--hard', 'FETCH_HEAD'], 'align');
    const cleaned = await checked(execute, paths, ['clean', '-fd'], 'align');
    const status = await checked(
      execute, paths, ['status', '--porcelain', '--untracked-files=all'], 'align'
    );
    if (status.stdout.trim()) {
      throw failure('Windows DEV repository did not converge to the LAN mirror', 64, 'align');
    }
    return { exitCode: 0, output: `${aligned.output}${cleaned.output}` };
  } catch (error) {
    return { exitCode: error.exitCode || 125, message: error.message, stage: error.stage || 'entry' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runWindowsDevPull();
  const stream = result.exitCode === 0 ? console.log : console.error;
  stream(`[windows-dev-pull] status: ${result.exitCode === 0 ? 'OK' : 'FAILED'} exit=${result.exitCode}` +
    `${result.stage ? ` stage=${result.stage}` : ''}`);
  process.exitCode = result.exitCode;
}
