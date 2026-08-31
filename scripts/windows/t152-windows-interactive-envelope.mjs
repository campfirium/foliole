import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { formalLaunchEnvHash } from './t152-windows-formal-interactive-contract.mjs';

const SHA = /^[0-9a-f]{64}$/u;
const PHASES = new Set(['g2-path', 'g3-anchor', 'formal']);
const ADMISSION_ACTION = 't152-prejourney-admission';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalInteractiveJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalInteractiveJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalInteractiveJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function g1Binding(prepared) {
  const requestSha256 = prepared.preparedRequest?.requestSha256;
  const token = prepared.preparedRequest?.token;
  const planSha256 = prepared.stages?.preflight?.receipt?.stagePlan?.planSha256;
  if (!SHA.test(requestSha256 ?? '') || !/^[A-Za-z0-9_-]+$/u.test(token ?? '')
      || !SHA.test(planSha256 ?? '')) throw new Error('G1 interactive binding is missing');
  return { finalizeReceiptPath: path.win32.join(prepared.paths.evidenceRoot,
    'prepare-finalize-receipt.json'), planSha256, requestSha256, tokenSha256: digest(token) };
}

export function createInteractiveConfig(prepared, phase, rootId, formal = {}, options = {}) {
  if (!PHASES.has(phase)) throw new Error('interactive phase is invalid');
  const { capsule, facts, paths } = prepared;
  const evidenceRoot = path.win32.join(paths.capsuleRoot, 'evidence', 'admission', rootId);
  const stateRoot = path.win32.join(paths.capsuleRoot, 'state', rootId);
  const ownerReceiptPath = path.win32.join(evidenceRoot, `t152-task-root-${rootId}.json`);
  const launchEnv = { sourceRoot: paths.sourceRoot, stateRoot, taskRoot: path.win32.join(
    paths.taskBaseRoot, rootId) };
  const identity = capsule.manifest.identity;
  const configPath = path.win32.join(paths.capsuleRoot, 'control', 'interactive', rootId,
    `${phase}.json`);
  const projectionReceiptPath = path.win32.join(paths.capsuleRoot, 'control', 'interactive',
    rootId, `${phase}-projection-receipt.json`);
  return { action: formal.action ?? ADMISSION_ACTION, baseRoot: paths.taskBaseRoot,
    ...(formal.attemptId ? { attemptId: formal.attemptId } : {}), capsuleId:
      path.win32.basename(paths.capsuleRoot), capsuleRoot: paths.capsuleRoot, configPath,
    controllerCommit: identity.controllerCommit, controllerRoot: paths.controllerRoot,
    controllerTree: identity.controllerTree, createdAt: new Date().toISOString(), evidenceRoot,
    entryMode: options.projectionOnly ? 'projection' : 'execute',
    ...(formal.expectedGroupId ? { expectedGroupId: formal.expectedGroupId,
      expectedGroupTag: formal.expectedGroupTag,
      ...(formal.expectedProviderDeviceId
        ? { expectedProviderDeviceId: formal.expectedProviderDeviceId } : {}) } : {}),
    formalAttempt: formal.attemptId ? { allocated: true, started: true }
      : { allocated: false, started: false }, g1: g1Binding(prepared),
    launchEnvHash: formalLaunchEnvHash(launchEnv), nodePath: facts.runtime.nodePath,
    nonce: randomUUID(), ownerReceiptPath, phase,
    ...(options.projectionOnly ? { projectionReceiptPath } : {}),
    productCommit: identity.productCommit,
    productTree: identity.productTree, protectedRoots: [paths.sourceRoot, paths.controllerRoot,
      paths.capsuleRoot, evidenceRoot, facts.roots.programFiles, facts.roots.systemRoot], rootId,
    schemaVersion: 1, sourceRoot: paths.sourceRoot, stateRoot, t7Run: identity.t7Run };
}

export function createInteractiveEnvelope(config) {
  const configJson = canonicalInteractiveJson(config);
  const configSha256 = digest(configJson);
  const envelopeJson = canonicalInteractiveJson({ configJson, configSha256, schemaVersion: 1 });
  const token = Buffer.from(envelopeJson, 'utf8').toString('base64url');
  if (!/^[A-Za-z0-9_-]+$/u.test(token) || token.includes('=')) {
    throw new Error('interactive token is not unpadded base64url');
  }
  return { config, configJson, configSha256, token, tokenSha256: digest(token) };
}

export function decodeInteractiveEnvelope(token) {
  if (!/^[A-Za-z0-9_-]+$/u.test(token ?? '')) throw new Error('interactive token is invalid');
  const envelope = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  if (envelope.schemaVersion !== 1 || digest(envelope.configJson ?? '') !== envelope.configSha256) {
    throw new Error('interactive envelope hash mismatch');
  }
  const config = JSON.parse(envelope.configJson);
  if (canonicalInteractiveJson(config) !== envelope.configJson) {
    throw new Error('interactive config is not canonical');
  }
  return { config, configSha256: envelope.configSha256 };
}

export function interactiveRemoteCommand(scriptPath, action, token) {
  if (!path.win32.isAbsolute(scriptPath ?? '') || !PHASES.has(action)
      || !/^[A-Za-z0-9_-]+$/u.test(token ?? '')) {
    throw new Error('interactive remote command is invalid');
  }
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath, '-Action', action, '-InteractiveBase64', token];
}

function same(left, right, label) {
  if (canonicalInteractiveJson(left) !== canonicalInteractiveJson(right)) {
    throw new Error(`interactive projection ${label} mismatch`);
  }
}

export function validateInteractiveProjectionReceipt(bytes, envelope) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('interactive projection receipt is not strict UTF-8'); }
  if (text.includes('\uFFFD')) throw new Error('interactive projection receipt has replacement text');
  const receipt = JSON.parse(text.replace(/^\uFEFF/u, ''));
  const { config } = envelope;
  const raw = Buffer.from(receipt.configRawBase64 ?? '', 'base64');
  if (receipt.schemaVersion !== 1 || receipt.phase !== config.phase
      || receipt.action !== config.action || receipt.configSha256 !== envelope.configSha256
      || receipt.materializedSha256 !== envelope.configSha256
      || receipt.tokenSha256 !== envelope.tokenSha256
      || receipt.projectionReceiptPath !== config.projectionReceiptPath
      || digest(raw) !== envelope.configSha256 || !raw.equals(Buffer.from(envelope.configJson))) {
    throw new Error('interactive projection receipt identity mismatch');
  }
  same(receipt.identity, { capsuleId: config.capsuleId,
    controllerCommit: config.controllerCommit, controllerTree: config.controllerTree,
    productCommit: config.productCommit, productTree: config.productTree,
    rootId: config.rootId, t7Run: config.t7Run }, 'identity');
  same(receipt.g1, config.g1, 'G1 binding');
  same(receipt.formalAttempt, config.formalAttempt, 'formal attempt');
  if (receipt.entryMode !== 'projection' || receipt.productStarted !== false
      || receipt.scheduledWorkerStarted !== false) {
    throw new Error('interactive projection receipt lifecycle mismatch');
  }
  for (const [name, value] of Object.entries(receipt.paths ?? {})) {
    if (value?.normalized !== config[name] && name !== 'projectionReceiptPath') {
      throw new Error(`interactive projection path mismatch: ${name}`);
    }
  }
  if (receipt.paths?.projectionReceiptPath?.normalized !== config.projectionReceiptPath) {
    throw new Error('interactive projection receipt path mismatch');
  }
  return receipt;
}
