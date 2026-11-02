#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { createTransientWorktree } from '../diagnostics/transient-worktree-lifecycle.mjs';
import { assertQualityCommandAllowed } from './quality-command-contracts.mjs';
import {
  assertQaPrivateDirectories, QA_BRANCH, qaGit, qaRecordPath, qaWorkspaceEnvironment,
  readQaWorkspace, verifyMountedQaVolume
} from './qa-workspace-state.mjs';

export function startQaWorkspace({ repoRoot, volumeRoot, worktreePath, owner,
  verifyVolume = verifyMountedQaVolume }) {
  const devRoot = realpathSync(repoRoot);
  if (qaGit(devRoot, 'branch', '--show-current') !== 'dev') throw new Error('Start QA from dev');
  if (!owner?.trim()) throw new Error('QA requires its owning chat ID');
  const existing = readQaWorkspace(devRoot);
  if (existing.phase !== 'idle') throw new Error(`QA occupied by ${existing.owner}; recover the existing workspace`);
  const volume = verifyVolume(volumeRoot);
  const requested = path.resolve(worktreePath);
  const target = path.join(realpathSync(path.dirname(requested)), path.basename(requested));
  if (!target.startsWith(`${volume}${path.sep}`) || existsSync(target)) {
    throw new Error('QA path must be a new directory on the mounted QA volume');
  }
  const record = { schemaVersion: 1, branch: QA_BRANCH, devRoot, worktreePath: target,
    owner, base: qaGit(devRoot, 'rev-parse', 'HEAD'), phase: 'preparing' };
  writeFileSync(qaRecordPath(devRoot), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return prepareQaWorkspace(record);
}

function prepareQaWorkspace(record) {
  try {
    createTransientWorktree({ branch: QA_BRANCH, kind: 'development', retainedBy: 'qa',
      repoRoot: record.devRoot, sourceRef: record.base, targetRef: 'dev', worktreePath: record.worktreePath });
    for (const name of ['.tmp/system', '.cache', '.lab/internal/runtime']) {
      mkdirSync(path.join(record.worktreePath, name), { recursive: true });
    }
    assertQaPrivateDirectories(record.worktreePath);
    record.phase = 'prepared';
    writeFileSync(qaRecordPath(record.devRoot), `${JSON.stringify(record, null, 2)}\n`);
    return readQaWorkspace(record.devRoot);
  } catch (error) {
    // Once Git registered a worktree, preserve both it and the claim for recovery.
    const registered = qaGit(record.devRoot, 'worktree', 'list', '--porcelain').includes(`branch refs/heads/${QA_BRANCH}`);
    if (!registered) rmSync(qaRecordPath(record.devRoot));
    throw error;
  }
}

export async function runQaWorkspaceCommand({ repoRoot, command, env = process.env }) {
  const record = readQaWorkspace(repoRoot);
  if (record.phase !== 'prepared') throw new Error('QA workspace is not prepared');
  if (!command.length) throw new Error('QA run requires a command after --');
  const childEnv = qaWorkspaceEnvironment(record, env);
  // Only the local operation owns the shared resource, never a hosted-run wait.
  const gate = fileURLToPath(new URL('../with-resource-gate.mjs', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [gate, 'node-heavy', '--', ...command], {
      cwd: record.worktreePath, env: childEnv, stdio: 'inherit', shell: false
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => signal ? reject(new Error(`QA command ended by ${signal}`)) : resolve(code ?? 1));
  });
}

async function main(args) {
  assertQualityCommandAllowed('runner:qa-workspace');
  const separator = args.indexOf('--');
  const options = separator < 0 ? args : args.slice(0, separator);
  const value = name => options[options.indexOf(name) + 1];
  const repoRoot = options.includes('--repo') ? path.resolve(value('--repo')) : process.cwd();
  if (args[0] === 'status') return console.log(JSON.stringify(readQaWorkspace(repoRoot), null, 2));
  if (args[0] === 'start') {
    for (const name of ['--volume', '--path', '--owner']) {
      if (!options.includes(name) || !value(name)) throw new Error(`${name} is required`);
    }
    return console.log(JSON.stringify(startQaWorkspace({ repoRoot, volumeRoot: value('--volume'),
      worktreePath: value('--path'), owner: value('--owner') }), null, 2));
  }
  if (args[0] === 'run') {
    if (separator < 0) throw new Error('QA run requires -- before the command');
    process.exitCode = await runQaWorkspaceCommand({ repoRoot, command: args.slice(separator + 1) });
    return;
  }
  throw new Error('Usage: qa-workspace.mjs start|status|run');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
