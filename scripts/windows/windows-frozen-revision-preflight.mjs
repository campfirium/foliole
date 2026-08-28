/* global process */

import fs from 'node:fs';
import path from 'node:path';

import {
  atomicWriteJson, completeFrozenPreflightReceipt, createFrozenAttemptId,
  failFrozenPreflightReceipt, openFrozenPreflightReceipt, sha256,
  updateFrozenPreflightReceipt
} from '../acceptance/frozen-revision-preflight-contract.mjs';
import {
  assertFrozenRuntimeOccupied, startFrozenRuntimeOccupancy, stopFrozenRuntimeOccupancy
} from './windows-frozen-runtime-occupancy.mjs';

const OWNER_FILE = 'owner.json';
const COMMAND_TIMEOUT_MS = 20 * 60_000;
const PACKAGE_TIMEOUT_MS = 30 * 60_000;

export function windowsFrozenAttemptId(runId) {
  return `${runId.slice(0, 8)}T${runId.slice(8)}`;
}

export function windowsFrozenPreflightCommands(sourceRoot, paths, { packageSmoke = false } = {}) {
  const commands = [
    { args: [paths.systemNpmCli, 'ci'], stage: 'dependencies' },
    { args: [paths.systemNpmCli, 'run', 'build'], stage: 'build' },
    { args: [paths.systemNpmCli, 'run', 'electron:native:health'], stage: 'native-health' }
  ];
  if (packageSmoke) commands.push({ args: [paths.systemNpmCli, 'run', 'windows:package'],
    stage: 'package-smoke', timeoutMs: PACKAGE_TIMEOUT_MS });
  return commands.map((command) => ({ ...command, bin: paths.systemNode, cwd: sourceRoot }));
}

export function windowsFrozenPreflightPaths(paths, _revision, attemptId, evidenceRoot) {
  const taskRoot = path.win32.join(paths.capsulesRoot, attemptId);
  return { archivePath: path.win32.join(taskRoot, 'source.tar'), evidenceRoot,
    logPath: path.join(evidenceRoot, 'action.log'), sourceRoot: path.win32.join(taskRoot, 'source'),
    taskRoot };
}

async function checked(execute, command, fsApi, logPath, manager) {
  updateFrozenPreflightReceipt(manager, { exit: { code: null, stage: command.stage } });
  const result = await execute(command.bin, command.args, {
    cwd: command.cwd, timeoutCode: `${command.stage}_timeout`,
    timeoutMs: command.timeoutMs ?? COMMAND_TIMEOUT_MS,
    windowsHide: true
  });
  fsApi.appendFileSync(logPath, `\n[${command.stage}]\n${result.output ?? ''}`, 'utf8');
  if (result.code !== 0) throw Object.assign(
    new Error(`${command.stage} failed with exit ${result.code}`),
    { exitCode: result.code, stage: command.stage }
  );
  return result;
}

async function sourceIdentity(execute, paths) {
  const git = async (args, stage) => {
    const result = await execute(paths.gitPath, ['-C', paths.repoRoot, ...args], {
      cwd: paths.repoRoot, timeoutCode: `${stage}_timeout`, timeoutMs: COMMAND_TIMEOUT_MS,
      windowsHide: true
    });
    if (result.code !== 0) throw Object.assign(
      new Error(`${stage} failed with exit ${result.code}`), { exitCode: result.code, stage }
    );
    return result.stdout.trim();
  };
  const revision = await git(['rev-parse', 'HEAD'], 'source-revision');
  const tree = await git(['rev-parse', 'HEAD^{tree}'], 'source-tree');
  const branch = await git(['branch', '--show-current'], 'source-branch');
  const status = await git(['status', '--porcelain', '--untracked-files=all'], 'source-status');
  if (branch !== 'dev' || status) throw Object.assign(
    new Error('Windows frozen source is not clean dev.'), { stage: 'source-status' }
  );
  return { revision, tree };
}

function writeOwner(runPaths, source, attemptId, fsApi) {
  fsApi.mkdirSync(runPaths.taskRoot);
  fsApi.mkdirSync(runPaths.sourceRoot);
  fsApi.writeFileSync(path.win32.join(runPaths.taskRoot, OWNER_FILE), `${JSON.stringify({
    attemptId, pid: process.pid, revision: source.revision
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function buildAttempt({ aggregateRoot, attemptId, execute, fsApi, lockOwnerPid,
  packageSmoke = false, paths, source }) {
  const evidenceRoot = path.join(aggregateRoot, 'attempts', attemptId);
  fsApi.mkdirSync(path.dirname(evidenceRoot), { recursive: true });
  const manager = openFrozenPreflightReceipt({ attemptId, evidenceRoot,
    host: 'windows', source }, { fsApi });
  const runPaths = windowsFrozenPreflightPaths(paths, source.revision, attemptId, evidenceRoot);
  fsApi.writeFileSync(runPaths.logPath, '', 'utf8');
  const attempt = { manager, runPaths, source };
  let stage = 'task-copy';
  try {
    fsApi.mkdirSync(paths.capsulesRoot, { recursive: true });
    writeOwner(runPaths, source, attemptId, fsApi);
    await checked(execute, { args: ['-C', paths.repoRoot, 'archive', '--format=tar',
      `--output=${runPaths.archivePath}`, source.revision], bin: paths.gitPath,
    cwd: paths.repoRoot, stage: 'archive' }, fsApi, runPaths.logPath, manager);
    const archiveDigest = sha256(fsApi.readFileSync(runPaths.archivePath));
    await checked(execute, { args: ['-xf', runPaths.archivePath, '-C', runPaths.sourceRoot],
      bin: paths.tarPath, cwd: runPaths.taskRoot, stage: 'extract' }, fsApi, runPaths.logPath, manager);
    fsApi.unlinkSync(runPaths.archivePath);
    updateFrozenPreflightReceipt(manager, { resourceLock: {
      ownerPid: lockOwnerPid, path: paths.buildLock, resultStatus: 'held-by-entry'
    }, taskCopy: { root: runPaths.taskRoot, sourceArchiveDigest: archiveDigest } });
    for (const command of windowsFrozenPreflightCommands(runPaths.sourceRoot, paths, { packageSmoke })) {
      stage = command.stage;
      await checked(execute, command, fsApi, runPaths.logPath, manager);
      if (stage === 'dependencies') updateFrozenPreflightReceipt(manager, { dependencies: {
        lockfileDigest: sha256(fsApi.readFileSync(path.win32.join(runPaths.sourceRoot,
          'package-lock.json'))), resultStatus: 'complete'
      } });
      if (stage === 'build') updateFrozenPreflightReceipt(manager, { build: { resultStatus: 'complete' } });
      if (stage === 'native-health') updateFrozenPreflightReceipt(manager, {
        nativeHealth: { resultStatus: 'complete' }
      });
      if (stage === 'package-smoke') updateFrozenPreflightReceipt(manager, {
        packageSmoke: { resultStatus: 'complete' }
      });
    }
    return attempt;
  } catch (error) {
    failFrozenPreflightReceipt(manager, error, error.stage ?? stage);
    throw Object.assign(error, { attempt });
  }
}

function cleanAttempt(attempt, fsApi) {
  const { manager, runPaths, source } = attempt;
  const owner = JSON.parse(fsApi.readFileSync(path.win32.join(runPaths.taskRoot, OWNER_FILE), 'utf8'));
  if (owner.attemptId !== manager.receipt.attemptId || owner.pid !== process.pid
      || owner.revision !== source.revision) {
    throw new Error('Refusing to clean a frozen Windows task copy owned by another attempt.');
  }
  fsApi.rmSync(runPaths.taskRoot, { recursive: true });
  updateFrozenPreflightReceipt(manager, { cleanup: { resultStatus: 'complete' } });
  return completeFrozenPreflightReceipt(manager);
}

function stableSnapshot(snapshot) {
  const reduced = snapshot.map(({ CommandLine, ProcessId }) => ({ CommandLine, ProcessId }));
  return JSON.stringify(reduced.toSorted((left, right) => left.ProcessId - right.ProcessId));
}

function aggregateAttempt(attempt) {
  return { attemptId: attempt.manager.receipt.attemptId,
    evidenceRoot: attempt.manager.receipt.evidence.root,
    receiptPath: attempt.manager.receiptPath, taskCopyRoot: attempt.runPaths.taskRoot };
}

export async function runWindowsFrozenRevisionPreflight({
  aggregateAttemptId, evidenceRoot, execute, fixedRuntimeBefore = [], fsApi = fs,
  paths, snapshotRuntime, startOccupancy = startFrozenRuntimeOccupancy
}) {
  const lockOwnerPid = Number.parseInt(process.env.FOLIOLE_WINDOWS_DEV_LOCK_OWNER ?? '', 10);
  if (!Number.isSafeInteger(lockOwnerPid) || lockOwnerPid <= 0) {
    throw new Error('Windows frozen revision preflight requires the fixed action lock.');
  }
  const source = await sourceIdentity(execute, paths);
  fsApi.mkdirSync(evidenceRoot);
  const aggregatePath = path.join(evidenceRoot, 'receipt.json');
  const attempts = [];
  let occupancy;
  try {
    const first = await buildAttempt({ aggregateRoot: evidenceRoot,
      attemptId: createFrozenAttemptId(), execute, fsApi, lockOwnerPid, paths, source });
    attempts.push(first);
    occupancy = await startOccupancy(first.runPaths.sourceRoot, {
      fsApi, nodeBin: paths.systemNode
    });
    const second = await buildAttempt({ aggregateRoot: evidenceRoot,
      attemptId: createFrozenAttemptId(), execute, fsApi, lockOwnerPid,
      packageSmoke: true, paths, source });
    attempts.push(second);
    const firstRuntimePid = occupancy.pid;
    const firstFingerprint = assertFrozenRuntimeOccupied(occupancy, fsApi);
    const fixedRuntimeAfter = await snapshotRuntime();
    if (stableSnapshot(fixedRuntimeBefore) !== stableSnapshot(fixedRuntimeAfter)) {
      throw Object.assign(new Error('Fixed Windows runtime changed during isolated attempts.'), {
        stage: 'fixed-runtime'
      });
    }
    const stableSource = await sourceIdentity(execute, paths);
    if (stableSource.revision !== source.revision || stableSource.tree !== source.tree) {
      throw Object.assign(new Error('Windows source moved during frozen preflight.'), {
        stage: 'source-stable'
      });
    }
    await stopFrozenRuntimeOccupancy(occupancy);
    occupancy = null;
    const completedAttempts = attempts.map((attempt) => cleanAttempt(attempt, fsApi));
    const receipt = { aggregateAttemptId, attempts: attempts.map(aggregateAttempt),
      attemptReceipts: completedAttempts.map(({ attemptId, resultStatus }) => ({
        attemptId, resultStatus
      })), cleanup: { resultStatus: 'complete' }, completedAt: new Date().toISOString(),
      exit: { code: 0, stage: 'complete' }, isolation: { distinctTaskCopies: true,
        firstRuntimeFingerprint: firstFingerprint, firstRuntimePid },
      resultStatus: 'complete', schemaVersion: 1, source };
    atomicWriteJson(aggregatePath, receipt, fsApi);
    return { output: '', receipt, receiptPath: aggregatePath };
  } catch (error) {
    await stopFrozenRuntimeOccupancy(occupancy).catch(() => undefined);
    if (error.attempt && !attempts.includes(error.attempt)) attempts.push(error.attempt);
    for (const attempt of attempts) if (attempt.manager.receipt.resultStatus === 'pending') {
      failFrozenPreflightReceipt(attempt.manager, error, error.stage ?? 'aggregate');
    }
    atomicWriteJson(aggregatePath, { aggregateAttemptId, attempts: attempts.map(aggregateAttempt),
      cleanup: { resultStatus: 'preserved-failure' }, completedAt: new Date().toISOString(),
      exit: { code: error.exitCode ?? 1, stage: error.stage ?? 'aggregate' },
      failure: { messageDigest: sha256(error.message) }, resultStatus: 'failed',
      schemaVersion: 1, source }, fsApi);
    throw Object.assign(error, { aggregateAttemptId, receiptPath: aggregatePath });
  }
}
