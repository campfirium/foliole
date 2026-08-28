/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { createFrozenAttemptId } from '../acceptance/frozen-revision-preflight-contract.mjs';
import {
  cleanupWindowsFrozenTaskCopy, createWindowsFrozenTaskCopy, inspectWindowsFrozenSource
} from './windows-frozen-task-copy.mjs';
import { syncGroupInteractivePaths } from './windows-sync-group-interactive-state.mjs';

const COMMAND_TIMEOUT_MS = 20 * 60_000;

function writeReceipt(handle, patch) {
  const receipt = { ...handle.receipt, ...patch, completedAt: new Date().toISOString() };
  fs.writeFileSync(handle.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  handle.receipt = receipt;
  return receipt;
}

export function routeRuntimeCommands(sourceRoot, paths) {
  return [
    { args: [paths.systemNpmCli, 'ci'], bin: paths.systemNode, stage: 'dependencies' },
    { args: [paths.systemNpmCli, 'run', 'build'], bin: paths.systemNode, stage: 'build' },
    { args: [paths.systemNpmCli, 'run', 'electron:rebuild:native'],
      bin: paths.systemNode, stage: 'native-rebuild' },
    { args: [path.join(sourceRoot, 'scripts', 'desktop', 'desktop-dnssd-native-probe.cjs')],
      bin: path.join(sourceRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
      stage: 'native-probe' }
  ].map((command) => ({ ...command, cwd: sourceRoot }));
}

async function runStage(execute, command, logPath) {
  let result;
  try {
    result = await execute(command.bin, command.args, {
      cwd: command.cwd, timeoutCode: `${command.stage}_timeout`,
      timeoutMs: COMMAND_TIMEOUT_MS, windowsHide: true
    });
  } catch (error) {
    fs.appendFileSync(logPath, `\n[${command.stage}]\n${error.output ?? error.message}\n`, 'utf8');
    throw Object.assign(error, { stage: command.stage });
  }
  fs.appendFileSync(logPath, `\n[${command.stage}]\n${result.output ?? ''}`, 'utf8');
  if (result.code !== 0) throw Object.assign(
    new Error(`${command.stage} failed with exit ${result.code}`),
    { exitCode: result.code, stage: command.stage }
  );
}

function cleanup(handle) {
  const cleanupResult = cleanupWindowsFrozenTaskCopy(handle.taskCopy);
  return { ...cleanupResult, taskRootRemoved: !fs.existsSync(handle.taskCopy.taskRoot) };
}

export async function prepareWindowsDesktopDnsSdRouteRuntime({ evidenceRoot, execute, paths }) {
  const lockOwnerPid = Number.parseInt(process.env.FOLIOLE_WINDOWS_DEV_LOCK_OWNER ?? '', 10);
  if (!Number.isSafeInteger(lockOwnerPid) || lockOwnerPid <= 0) {
    throw new Error('Windows route runtime requires the fixed action lock.');
  }
  const source = await inspectWindowsFrozenSource(execute, paths);
  const attemptId = createFrozenAttemptId();
  const runtimeEvidenceRoot = path.join(evidenceRoot, 'desktop-dnssd-route-runtime');
  fs.mkdirSync(runtimeEvidenceRoot);
  const handle = { logPath: path.join(runtimeEvidenceRoot, 'action.log'), receipt: null,
    receiptPath: path.join(runtimeEvidenceRoot, 'receipt.json'), taskCopy: null };
  fs.writeFileSync(handle.logPath, '', 'utf8');
  try {
    handle.taskCopy = await createWindowsFrozenTaskCopy({
      attemptId, execute, logPath: handle.logPath, paths, source
    });
    handle.receipt = { attemptId, cleanup: { resultStatus: 'pending' },
      evidenceRoot: runtimeEvidenceRoot, exit: { code: null, stage: 'runtime-build' },
      resultStatus: 'pending', roots: {
        evidence: evidenceRoot, runtime: handle.taskCopy.sourceRoot,
        source: handle.taskCopy.sourceRoot,
        productState: path.join(paths.repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'windows-c'),
        workerState: syncGroupInteractivePaths(paths.repoRoot).request.replace(/request\.json$/u, '')
      }, schemaVersion: 1, source, taskOwner: {
        attemptId, ownerPid: lockOwnerPid, taskRoot: handle.taskCopy.taskRoot
      } };
    writeReceipt(handle, {});
    for (const command of routeRuntimeCommands(handle.taskCopy.sourceRoot, paths)) {
      writeReceipt(handle, { exit: { code: null, stage: command.stage } });
      await runStage(execute, command, handle.logPath);
    }
    writeReceipt(handle, { exit: { code: null, stage: 'interactive-worker' } });
    return handle;
  } catch (error) {
    handle.taskCopy ??= error.taskCopy ?? null;
    const cleanupResult = handle.taskCopy ? cleanup(handle) : { resultStatus: 'not-created' };
    handle.receipt ??= { attemptId, evidenceRoot: runtimeEvidenceRoot, schemaVersion: 1, source };
    writeReceipt(handle, { cleanup: cleanupResult,
      exit: { code: error.exitCode ?? 1, stage: error.stage ?? 'task-copy' },
      failure: { message: error.message }, resultStatus: 'failed' });
    throw Object.assign(error, { routeRuntime: handle.receipt, routeRuntimeReceipt: handle.receiptPath });
  }
}

export function finishWindowsDesktopDnsSdRouteRuntime(handle, error = null) {
  const cleanupResult = cleanup(handle);
  const receipt = writeReceipt(handle, { cleanup: cleanupResult,
    exit: { code: error?.exitCode ?? (error ? 1 : 0), stage: error ? 'interactive-worker' : 'complete' },
    ...(error ? { failure: { message: error.message } } : {}),
    resultStatus: error ? 'failed' : 'success' });
  if (error) throw Object.assign(error, { routeRuntime: receipt, routeRuntimeReceipt: handle.receiptPath });
  return receipt;
}
