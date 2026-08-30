/* global clearTimeout, process, setTimeout */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import { t152PrepareRemoteCommand } from './t152-windows-prepare-request.mjs';

export const PREPARE_STAGES = ['materialize', 'dependencies', 'electron-runtime', 'build',
  'electron-compile', 'native', 'package', 'finalize'];
export const PREPARE_DEADLINE_MS = 45 * 60 * 1000;

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function terminal(command, args, { deadlineAt, env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, { detached: true, env, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    const remaining = Math.max(0, deadlineAt - Date.now());
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
        if (error.code !== 'ESRCH') stderr += `\nprocess-group termination failed: ${error.message}`;
      }
    }, remaining);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ durationMs: Date.now() - started, endedAt: new Date().toISOString(),
        error: error.message, exitCode: null, signal: null, startedAt: new Date(started).toISOString(),
        stderr, stdout, timedOut });
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ durationMs: Date.now() - started, endedAt: new Date().toISOString(),
        exitCode, signal, startedAt: new Date(started).toISOString(), stderr, stdout, timedOut });
    });
  });
}

async function copy(command, args, options) {
  const result = await terminal(command, args, options);
  if (result.exitCode !== 0) throw Object.assign(new Error(`${command} transfer failed`), result);
  return result;
}

export function validatePrepareStageReceipt(receipt, expected) {
  const identityMatches = Object.entries(expected.identity).every(
    ([key, value]) => receipt.identity?.[key] === value);
  if (receipt.resultStatus !== 'success' || receipt.stage !== expected.stage
      || receipt.requestSha256 !== expected.requestSha256
      || receipt.tokenSha256 !== expected.tokenSha256
      || receipt.capsuleId !== expected.capsuleId || receipt.capsuleRoot !== expected.capsuleRoot
      || receipt.hostFactsSha256 !== expected.hostFactsSha256
      || receipt.rootId !== expected.rootId
      || receipt.predecessorReceiptSha256 !== expected.predecessorReceiptSha256
      || !identityMatches || receipt.rawExit !== 0 || receipt.rawSignal !== null) {
    throw new Error(`prepare ${expected.stage} receipt is invalid`);
  }
  return receipt;
}

export function validateBindingPreflight(parsed, request, requestSha256) {
  const paths = ['capsuleRoot', 'controllerArchivePath', 'controllerRoot', 'evidenceRoot',
    'manifestPath', 'nodePath', 'npmPath', 'prepareHelperPath', 'productArchivePath',
    'sourceRoot', 'tarPath'];
  const normalized = parsed?.pathPredicate?.normalizedPaths;
  const rejected = parsed?.pathPredicate?.selfcheck?.rejected;
  const pathExact = paths.every((field) => normalized?.[field]?.value === request[field]
    && normalized[field].normalized === request[field]
    && normalized[field].localRoot === path.win32.parse(request[field]).root);
  const negativeExact = ['relative', 'driveRelative', 'rootRelative', 'uri',
    'normalizationMismatch'].every((field) => rejected?.[field] === true);
  if (parsed?.requestSha256 !== requestSha256 || parsed?.runtimeExact !== true
      || !Object.values(parsed?.runtimeExists ?? {}).every((value) => value === true)
      || !parsed?.pathPredicate?.powershellVersion || !parsed?.pathPredicate?.clrVersion
      || !/^[0-9a-f]{64}$/u.test(parsed?.pathPredicate?.schemaSha256 ?? '')
      || !pathExact || !negativeExact) throw new Error('prepare binding preflight failed');
  return parsed;
}

function localTerminalReceipt(capsule, name, value) {
  const file = path.join(capsule.root, name);
  const reread = atomicJson(file, value);
  if (digest(fs.readFileSync(file)) !== digest(Buffer.from(`${JSON.stringify(value, null, 2)}\n`))) {
    throw new Error(`${name} atomic reread failed`);
  }
  return { file, receipt: reread };
}

export async function runT152WindowsPrepareStages({ capsule, env, host, hostFactsSha256,
  paths, preparedRequest, sshBase, staging }) {
  let deadlineAt = Date.now() + PREPARE_DEADLINE_MS;
  const remote = (local, target) => copy('scp', ['-q', ...sshBase, local,
    `${host}:${target.replaceAll('\\', '/')}`], { deadlineAt, env });
  await remote(staging.actionLocal, staging.action);
  const preflightTerminal = await terminal('ssh', ['-T', ...sshBase, host,
    ...t152PrepareRemoteCommand(staging.action, 'binding-preflight', preparedRequest.token)],
  { deadlineAt, env });
  const parsed = JSON.parse(/^T152_BINDING_PREFLIGHT=(.+)$/mu.exec(
    preflightTerminal.stdout)?.[1] ?? 'null');
  const absence = { archivesUploaded: false, capsuleMaterialized: false,
    longPrepareStarted: false, stagingUploaded: false };
  const preflight = localTerminalReceipt(capsule, 'g1a-binding-terminal.json', {
    absence, capsuleId: preparedRequest.request.capsuleId,
    capsuleRoot: preparedRequest.request.capsuleRoot, hostFactsSha256,
    identity: preparedRequest.request.identity, parsed,
    requestSha256: preparedRequest.requestSha256, rootId: preparedRequest.request.rootId,
    schemaVersion: 1, terminal: preflightTerminal, tokenSha256: digest(preparedRequest.token) });
  try {
    if (preflightTerminal.exitCode !== 0 || preflightTerminal.signal !== null
        || preflightTerminal.timedOut) throw new Error('prepare binding terminal failed');
    validateBindingPreflight(parsed, preparedRequest.request, preparedRequest.requestSha256);
  } catch {
    throw Object.assign(new Error('prepare binding preflight failed'), { preflight });
  }
  deadlineAt = Date.now() + PREPARE_DEADLINE_MS;
  await Promise.all([[staging.helperLocal, staging.helper],
    [capsule.productArchive, staging.product], [capsule.controllerArchive, staging.controller],
    [capsule.manifestPath, staging.manifest]].map(([local, target]) => remote(local, target)));

  const receipts = []; let predecessorReceiptSha256 = null;
  for (const stage of PREPARE_STAGES) {
    const action = `prepare-${stage}`;
    const stageTerminal = await terminal('ssh', ['-T', ...sshBase, host,
      ...t152PrepareRemoteCommand(staging.action, action, preparedRequest.token)],
    { deadlineAt, env });
    const terminalRecord = localTerminalReceipt(capsule, `${action}-outer-terminal.json`, {
      action, deadlineAt: new Date(deadlineAt).toISOString(), schemaVersion: 1,
      terminal: stageTerminal });
    const localReceipt = path.join(capsule.root, `${action}-receipt.json`);
    try {
      await copy('scp', ['-q', ...sshBase,
        `${host}:${path.win32.join(paths.evidenceRoot, `${action}-receipt.json`).replaceAll('\\', '/')}`,
        localReceipt], { deadlineAt, env });
      const receipt = JSON.parse(fs.readFileSync(localReceipt, 'utf8').replace(/^\uFEFF/u, ''));
      validatePrepareStageReceipt(receipt, { capsuleId: preparedRequest.request.capsuleId,
        capsuleRoot: preparedRequest.request.capsuleRoot,
        hostFactsSha256,
        identity: preparedRequest.request.identity, predecessorReceiptSha256,
        requestSha256: preparedRequest.requestSha256, rootId: preparedRequest.request.rootId,
        stage, tokenSha256: digest(preparedRequest.token) });
      predecessorReceiptSha256 = digest(fs.readFileSync(localReceipt));
      receipts.push({ localReceipt, receipt, terminalRecord });
    } catch (error) {
      const notStarted = PREPARE_STAGES.slice(PREPARE_STAGES.indexOf(stage) + 1);
      const failure = localTerminalReceipt(capsule, `${action}-failure.json`, {
        action, error: error.message, notStarted, schemaVersion: 1, terminal: stageTerminal });
      throw Object.assign(new Error(`${action} failed`), { failure, receipts });
    }
    if (stageTerminal.exitCode !== 0 || stageTerminal.signal !== null || stageTerminal.timedOut) {
      throw Object.assign(new Error(`${action} terminal failed`), { receipts });
    }
  }
  return { preflight, receipts };
}
