/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const OWNER_FILE = 'owner.json';
const COMMAND_TIMEOUT_MS = 20 * 60_000;

function commandFailure(message, stage, exitCode) {
  return Object.assign(new Error(message), { exitCode, stage });
}

async function gitValue(execute, paths, args, stage) {
  const result = await execute(paths.gitPath, ['-C', paths.repoRoot, ...args], {
    cwd: paths.repoRoot, timeoutCode: `${stage}_timeout`, timeoutMs: COMMAND_TIMEOUT_MS,
    windowsHide: true
  });
  if (result.code !== 0) {
    throw commandFailure(`${stage} failed with exit ${result.code}`, stage, result.code);
  }
  return result.stdout.trim();
}

export async function inspectWindowsFrozenSource(execute, paths) {
  const revision = await gitValue(execute, paths, ['rev-parse', 'HEAD'], 'source-revision');
  const tree = await gitValue(execute, paths, ['rev-parse', 'HEAD^{tree}'], 'source-tree');
  const branch = await gitValue(execute, paths, ['branch', '--show-current'], 'source-branch');
  const status = await gitValue(
    execute, paths, ['status', '--porcelain', '--untracked-files=all'], 'source-status'
  );
  if (branch !== 'dev' || status) {
    throw commandFailure('Windows frozen source is not clean dev.', 'source-status');
  }
  return { revision, tree };
}

export function windowsFrozenTaskCopyPaths(paths, attemptId) {
  const taskRoot = path.win32.join(paths.capsulesRoot, attemptId);
  return {
    archivePath: path.win32.join(taskRoot, 'source.tar'),
    ownerPath: path.win32.join(taskRoot, OWNER_FILE),
    sourceRoot: path.win32.join(taskRoot, 'source'), taskRoot
  };
}

function writeOwner(copy, source, attemptId, fsApi) {
  fsApi.mkdirSync(copy.taskRoot);
  fsApi.mkdirSync(copy.sourceRoot);
  fsApi.writeFileSync(copy.ownerPath, `${JSON.stringify({
    attemptId, pid: process.pid, revision: source.revision
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function runCopyCommand(execute, command, fsApi, logPath) {
  let result;
  try {
    result = await execute(command.bin, command.args, {
      cwd: command.cwd, timeoutCode: `${command.stage}_timeout`,
      timeoutMs: COMMAND_TIMEOUT_MS, windowsHide: true
    });
  } catch (error) {
    if (logPath) fsApi.appendFileSync(logPath,
      `\n[${command.stage}]\n${error.output ?? error.message}\n`, 'utf8');
    throw Object.assign(error, { stage: command.stage });
  }
  if (logPath) fsApi.appendFileSync(logPath, `\n[${command.stage}]\n${result.output ?? ''}`, 'utf8');
  if (result.code !== 0) {
    throw commandFailure(`${command.stage} failed with exit ${result.code}`,
      command.stage, result.code);
  }
  return result;
}

export async function createWindowsFrozenTaskCopy({
  attemptId, execute, fsApi = fs, logPath, paths, source
}) {
  const copy = windowsFrozenTaskCopyPaths(paths, attemptId);
  fsApi.mkdirSync(paths.capsulesRoot, { recursive: true });
  writeOwner(copy, source, attemptId, fsApi);
  try {
    await runCopyCommand(execute, { args: ['-C', paths.repoRoot, 'archive', '--format=tar',
      `--output=${copy.archivePath}`, source.revision], bin: paths.gitPath,
    cwd: paths.repoRoot, stage: 'archive' }, fsApi, logPath);
    const archiveDigest = createHash('sha256').update(fsApi.readFileSync(copy.archivePath)).digest('hex');
    await runCopyCommand(execute, { args: ['-xf', copy.archivePath, '-C', copy.sourceRoot],
      bin: paths.tarPath, cwd: copy.taskRoot, stage: 'extract' }, fsApi, logPath);
    fsApi.unlinkSync(copy.archivePath);
    return { ...copy, archiveDigest, attemptId, source };
  } catch (error) {
    throw Object.assign(error, { taskCopy: { ...copy, attemptId, source } });
  }
}

export function cleanupWindowsFrozenTaskCopy(taskCopy, fsApi = fs) {
  const owner = JSON.parse(fsApi.readFileSync(taskCopy.ownerPath, 'utf8'));
  if (owner.attemptId !== taskCopy.attemptId || owner.pid !== process.pid
      || owner.revision !== taskCopy.source.revision) {
    throw new Error('Refusing to clean a frozen Windows task copy owned by another attempt.');
  }
  fsApi.rmSync(taskCopy.taskRoot, { recursive: true });
  return { owner, resultStatus: 'complete' };
}
