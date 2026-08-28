/* global process */

import fs from 'node:fs';
import path from 'node:path';

import {
  completeFrozenPreflightReceipt, failFrozenPreflightReceipt, openFrozenPreflightReceipt,
  sha256, updateFrozenPreflightReceipt
} from '../acceptance/frozen-revision-preflight-contract.mjs';

const OWNER_FILE = 'owner.json';
const COMMAND_TIMEOUT_MS = 20 * 60_000;

export function windowsFrozenAttemptId(runId) {
  return `${runId.slice(0, 8)}T${runId.slice(8)}`;
}

export function windowsFrozenPreflightCommands(sourceRoot, paths) {
  return [
    { args: [paths.systemNpmCli, 'ci'], stage: 'dependencies' },
    { args: [paths.systemNpmCli, 'run', 'build'], stage: 'build' },
    { args: [paths.systemNpmCli, 'run', 'electron:native:health'], stage: 'native-health' }
  ].map((command) => ({ ...command, bin: paths.systemNode, cwd: sourceRoot }));
}

export function windowsFrozenPreflightPaths(paths, revision, attemptId, evidenceRoot) {
  const taskRoot = path.win32.join(paths.capsulesRoot, attemptId);
  return { archivePath: path.win32.join(taskRoot, 'source.tar'), evidenceRoot,
    logPath: path.join(evidenceRoot, 'action.log'), sourceRoot: path.win32.join(taskRoot, 'source'),
    taskRoot };
}

async function checked(execute, command, fsApi, logPath, manager) {
  updateFrozenPreflightReceipt(manager, { exit: { code: null, stage: command.stage } });
  const result = await execute(command.bin, command.args, {
    cwd: command.cwd, timeoutCode: `${command.stage}_timeout`, timeoutMs: COMMAND_TIMEOUT_MS,
    windowsHide: true
  });
  fsApi.appendFileSync(logPath, `\n[${command.stage}]\n${result.output ?? ''}`, 'utf8');
  if (result.code !== 0) {
    throw Object.assign(new Error(`${command.stage} failed with exit ${result.code}`), {
      exitCode: result.code, stage: command.stage
    });
  }
  return result;
}

async function sourceIdentity(execute, paths) {
  const git = async (args, stage) => {
    const result = await execute(paths.gitPath, ['-C', paths.repoRoot, ...args], {
      cwd: paths.repoRoot, timeoutCode: `${stage}_timeout`, timeoutMs: COMMAND_TIMEOUT_MS,
      windowsHide: true
    });
    if (result.code !== 0) {
      throw Object.assign(new Error(`${stage} failed with exit ${result.code}`), {
        exitCode: result.code, stage
      });
    }
    return result.stdout.trim();
  };
  const revision = await git(['rev-parse', 'HEAD'], 'source-revision');
  const tree = await git(['rev-parse', 'HEAD^{tree}'], 'source-tree');
  const branch = await git(['branch', '--show-current'], 'source-branch');
  const status = await git(['status', '--porcelain', '--untracked-files=all'], 'source-status');
  if (branch !== 'dev' || status) {
    throw Object.assign(new Error('Windows frozen source is not clean dev.'), { stage: 'source-status' });
  }
  return { revision, tree };
}

function sameRuntime(left, right) {
  return left?.ProcessId === right?.ProcessId && left?.CommandLine === right?.CommandLine;
}

function cleanOwnedTaskCopy(runPaths, source, attemptId, fsApi) {
  const owner = JSON.parse(fsApi.readFileSync(path.win32.join(runPaths.taskRoot, OWNER_FILE), 'utf8'));
  if (owner.attemptId !== attemptId || owner.pid !== process.pid || owner.revision !== source.revision) {
    throw new Error('Refusing to clean a frozen Windows task copy owned by another attempt.');
  }
  fsApi.rmSync(runPaths.taskRoot, { recursive: true });
}

export async function runWindowsFrozenRevisionPreflight({
  attemptId, evidenceRoot, execute, fsApi = fs, paths, snapshotRuntime, trustedRuntime
}) {
  const lockOwnerPid = Number.parseInt(process.env.FOLIOLE_WINDOWS_DEV_LOCK_OWNER ?? '', 10);
  if (!Number.isSafeInteger(lockOwnerPid) || lockOwnerPid <= 0) {
    throw new Error('Windows frozen revision preflight requires the fixed action lock.');
  }
  fsApi.mkdirSync(path.dirname(evidenceRoot), { recursive: true });
  const source = await sourceIdentity(execute, paths);
  const manager = openFrozenPreflightReceipt({ attemptId, evidenceRoot,
    host: 'windows', source }, { fsApi });
  const runPaths = windowsFrozenPreflightPaths(paths, source.revision, attemptId, evidenceRoot);
  fsApi.writeFileSync(runPaths.logPath, '', 'utf8');
  let stage = 'task-copy';
  try {
    fsApi.mkdirSync(paths.capsulesRoot, { recursive: true });
    fsApi.mkdirSync(runPaths.taskRoot);
    fsApi.mkdirSync(runPaths.sourceRoot);
    fsApi.writeFileSync(path.win32.join(runPaths.taskRoot, OWNER_FILE), `${JSON.stringify({
      attemptId, pid: process.pid, revision: source.revision
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await checked(execute, { args: ['-C', paths.repoRoot, 'archive', '--format=tar',
      `--output=${runPaths.archivePath}`, source.revision], bin: paths.gitPath,
    cwd: paths.repoRoot, stage: 'archive' }, fsApi, runPaths.logPath, manager);
    const archiveDigest = sha256(fsApi.readFileSync(runPaths.archivePath));
    await checked(execute, { args: ['-xf', runPaths.archivePath, '-C', runPaths.sourceRoot],
      bin: paths.tarPath, cwd: runPaths.taskRoot, stage: 'extract' }, fsApi, runPaths.logPath, manager);
    fsApi.unlinkSync(runPaths.archivePath);
    updateFrozenPreflightReceipt(manager, { resourceLock: {
      ownerPid: lockOwnerPid,
      path: paths.buildLock, resultStatus: 'held-by-entry', trustedRuntime
    }, taskCopy: { root: runPaths.taskRoot, sourceArchiveDigest: archiveDigest } });
    for (const command of windowsFrozenPreflightCommands(runPaths.sourceRoot, paths)) {
      stage = command.stage;
      await checked(execute, command, fsApi, runPaths.logPath, manager);
      if (stage === 'dependencies') updateFrozenPreflightReceipt(manager, { dependencies: {
        lockfileDigest: sha256(fsApi.readFileSync(path.win32.join(runPaths.sourceRoot, 'package-lock.json'))),
        resultStatus: 'complete'
      } });
      if (stage === 'build') updateFrozenPreflightReceipt(manager, { build: { resultStatus: 'complete' } });
      if (stage === 'native-health') updateFrozenPreflightReceipt(manager, {
        nativeHealth: { resultStatus: 'complete' }
      });
    }
    const runtimeAfter = await snapshotRuntime();
    if (runtimeAfter.length !== 1 || !sameRuntime(trustedRuntime, runtimeAfter[0])) {
      throw Object.assign(new Error('Trusted Windows runtime changed during isolated preflight.'), {
        stage: 'trusted-runtime'
      });
    }
    const stable = await sourceIdentity(execute, paths);
    if (stable.revision !== source.revision || stable.tree !== source.tree) {
      throw Object.assign(new Error('Windows source moved during frozen preflight.'), { stage: 'source-stable' });
    }
    stage = 'cleanup';
    cleanOwnedTaskCopy(runPaths, source, attemptId, fsApi);
    updateFrozenPreflightReceipt(manager, { cleanup: { resultStatus: 'complete' } });
    const receipt = completeFrozenPreflightReceipt(manager);
    return { output: '', receipt, receiptPath: manager.receiptPath };
  } catch (error) {
    failFrozenPreflightReceipt(manager, error, error.stage ?? stage);
    throw Object.assign(error, { receiptPath: manager.receiptPath });
  }
}
