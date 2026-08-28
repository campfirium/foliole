#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  completeFrozenPreflightReceipt, createFrozenAttemptId, failFrozenPreflightReceipt,
  openFrozenPreflightReceipt, sha256, updateFrozenPreflightReceipt
} from '../acceptance/frozen-revision-preflight-contract.mjs';
import { currentAcceptanceCandidate } from '../sync-group/multi-device-sync-candidate.mjs';

const OWNER_FILE = 'owner.json';
const MAX_OUTPUT = 64 * 1024 * 1024;

export function macosFrozenPreflightCommands(sourceRoot) {
  return [
    { args: ['ci'], bin: 'npm', stage: 'dependencies' },
    { args: ['run', 'build'], bin: 'npm', stage: 'build' },
    { args: ['run', 'electron:native:health'], bin: 'npm', stage: 'native-health' }
  ].map((command) => ({ ...command, cwd: sourceRoot }));
}

export function macosFrozenPreflightPaths(repoRoot, source, attemptId) {
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts',
    'frozen-revision-preflight', source.revision, 'macos', attemptId);
  const taskRoot = path.join(repoRoot, '.lab', 'internal',
    'frozen-revision-preflight', 'macos', attemptId);
  return { archivePath: path.join(taskRoot, 'source.tar'), evidenceRoot,
    logPath: path.join(evidenceRoot, 'action.log'), sourceRoot: path.join(taskRoot, 'source'),
    taskRoot };
}

function appendResult(logPath, stage, result, fsApi) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  fsApi.appendFileSync(logPath, `\n[${stage}]\n${output}`, 'utf8');
}

function checked(run, command, logPath, fsApi, manager) {
  updateFrozenPreflightReceipt(manager, { exit: { code: null, stage: command.stage } });
  const result = run(command.bin, command.args, {
    cwd: command.cwd, encoding: 'utf8', env: manager.env, maxBuffer: MAX_OUTPUT, shell: false
  });
  appendResult(logPath, command.stage, result, fsApi);
  if (result.status !== 0) {
    throw Object.assign(new Error(`${command.stage} failed with exit ${result.status ?? 1}`), {
      exitCode: result.status ?? 1, stage: command.stage
    });
  }
}

function createTaskCopy(paths, source, run, fsApi, manager) {
  fsApi.mkdirSync(path.dirname(paths.taskRoot), { recursive: true });
  fsApi.mkdirSync(paths.taskRoot);
  fsApi.mkdirSync(paths.sourceRoot);
  fsApi.writeFileSync(path.join(paths.taskRoot, OWNER_FILE), `${JSON.stringify({
    attemptId: manager.receipt.attemptId, pid: process.pid, revision: source.revision
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  checked(run, { args: ['archive', '--format=tar', `--output=${paths.archivePath}`,
    source.revision], bin: 'git', cwd: manager.repoRoot, stage: 'archive' },
  paths.logPath, fsApi, manager);
  const archiveDigest = sha256(fsApi.readFileSync(paths.archivePath));
  checked(run, { args: ['-xf', paths.archivePath, '-C', paths.sourceRoot],
    bin: 'tar', cwd: paths.taskRoot, stage: 'extract' }, paths.logPath, fsApi, manager);
  fsApi.unlinkSync(paths.archivePath);
  updateFrozenPreflightReceipt(manager, { taskCopy: {
    root: paths.taskRoot, sourceArchiveDigest: archiveDigest
  } });
}

function cleanOwnedTaskCopy(paths, source, attemptId, fsApi) {
  const owner = JSON.parse(fsApi.readFileSync(path.join(paths.taskRoot, OWNER_FILE), 'utf8'));
  if (owner.attemptId !== attemptId || owner.pid !== process.pid || owner.revision !== source.revision) {
    throw new Error('Refusing to clean a frozen macOS task copy owned by another attempt.');
  }
  fsApi.rmSync(paths.taskRoot, { recursive: true });
}

function assertSourceStable(repoRoot, expected) {
  const current = currentAcceptanceCandidate(repoRoot, 'diagnostic');
  if (!current.clean || current.revision !== expected.revision || current.treeDigest !== expected.tree) {
    throw new Error('Mac source moved during frozen revision preflight.');
  }
}

export function runMacosFrozenRevisionPreflight({
  env = process.env, fsApi = fs, id, now, repoRoot = process.cwd(), run = spawnSync
} = {}) {
  if (process.platform !== 'darwin') throw new Error('macOS frozen revision preflight requires macOS.');
  if (!(env.FOLIOLE_RESOURCE_GATE_HELD ?? '').split(',').includes('node-heavy')) {
    throw new Error('macOS frozen revision preflight requires the node-heavy resource gate.');
  }
  const candidate = currentAcceptanceCandidate(repoRoot, 'diagnostic');
  if (!candidate.clean) throw new Error('macOS frozen revision preflight requires a clean dev source.');
  const source = { revision: candidate.revision, tree: candidate.treeDigest };
  const attemptId = createFrozenAttemptId({ id, now });
  const paths = macosFrozenPreflightPaths(repoRoot, source, attemptId);
  fsApi.mkdirSync(path.dirname(paths.evidenceRoot), { recursive: true });
  const manager = openFrozenPreflightReceipt({ attemptId, evidenceRoot: paths.evidenceRoot,
    host: 'macos', source }, { fsApi });
  manager.env = env;
  manager.repoRoot = repoRoot;
  updateFrozenPreflightReceipt(manager, { resourceLock: {
    className: 'node-heavy', resultStatus: 'held'
  } });
  fsApi.writeFileSync(paths.logPath, '', 'utf8');
  let stage = 'task-copy';
  try {
    createTaskCopy(paths, source, run, fsApi, manager);
    for (const command of macosFrozenPreflightCommands(paths.sourceRoot)) {
      stage = command.stage;
      checked(run, command, paths.logPath, fsApi, manager);
      if (stage === 'dependencies') updateFrozenPreflightReceipt(manager, { dependencies: {
        lockfileDigest: sha256(fsApi.readFileSync(path.join(paths.sourceRoot, 'package-lock.json'))),
        resultStatus: 'complete'
      } });
      if (stage === 'build') updateFrozenPreflightReceipt(manager, { build: { resultStatus: 'complete' } });
      if (stage === 'native-health') updateFrozenPreflightReceipt(manager, {
        nativeHealth: { resultStatus: 'complete' }
      });
    }
    assertSourceStable(repoRoot, source);
    stage = 'cleanup';
    cleanOwnedTaskCopy(paths, source, attemptId, fsApi);
    updateFrozenPreflightReceipt(manager, { cleanup: { resultStatus: 'complete' } });
    return { receipt: completeFrozenPreflightReceipt(manager), receiptPath: manager.receiptPath };
  } catch (error) {
    failFrozenPreflightReceipt(manager, error, error.stage ?? stage);
    throw Object.assign(error, { receiptPath: manager.receiptPath });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = runMacosFrozenRevisionPreflight();
    console.log(`[macos-frozen-preflight] status=complete receipt=${result.receiptPath}`);
  } catch (error) {
    console.error(`[macos-frozen-preflight] status=failed receipt=${error.receiptPath ?? '-'} message=${error.message}`);
    process.exitCode = 1;
  }
}
