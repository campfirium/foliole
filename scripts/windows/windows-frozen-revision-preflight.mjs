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
import {
  cleanupWindowsFrozenTaskCopy, createWindowsFrozenTaskCopy,
  inspectWindowsFrozenSource, windowsFrozenTaskCopyPaths
} from './windows-frozen-task-copy.mjs';

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
  return { ...windowsFrozenTaskCopyPaths(paths, attemptId), evidenceRoot,
    logPath: path.join(evidenceRoot, 'action.log') };
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
    const prepared = await createWindowsFrozenTaskCopy({
      attemptId, execute, fsApi, logPath: runPaths.logPath, paths, source
    });
    Object.assign(runPaths, prepared);
    updateFrozenPreflightReceipt(manager, { resourceLock: {
      ownerPid: lockOwnerPid, path: paths.buildLock, resultStatus: 'held-by-entry'
    }, taskCopy: { root: runPaths.taskRoot, sourceArchiveDigest: prepared.archiveDigest } });
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
  cleanupWindowsFrozenTaskCopy({ ...runPaths, attemptId: manager.receipt.attemptId, source }, fsApi);
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
  const source = await inspectWindowsFrozenSource(execute, paths);
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
    const stableSource = await inspectWindowsFrozenSource(execute, paths);
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
