import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { verifyT152DesktopDnsSdLibrary } from '../desktop/t152-desktop-dnssd-library.mjs';
import { bootstrapStatePaths, validateBootstrapConfig } from
  './t152-windows-formal-interactive-bootstrap.mjs';
import { validateFormalInteractiveRequest } from './t152-windows-formal-interactive-contract.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const same = (left, right) => canonical(left) === canonical(right);
const SLOT_NAMES = ['request', 'config', 'launch', 'status', 'result', 'terminal'];
const samePath = (left, right, pathApi) => pathApi.normalize(left).toLowerCase()
  === pathApi.normalize(right).toLowerCase();

function readFile(file, fsApi) {
  const stat = fsApi.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('T152 generation file is invalid.');
  const bytes = fsApi.readFileSync(file);
  return { bytes, parsed: JSON.parse(bytes.toString('utf8')),
    fact: { exists: true, sha256: digest(bytes), size: bytes.length } };
}

function identityFromRequest(request) {
  return { capsuleId: request.capsuleId, controllerCommit: request.controllerCommit,
    controllerTree: request.controllerTree, productCommit: request.productCommit,
    productTree: request.productTree, rootId: request.rootId, t7Run: request.t7Run };
}

function assertCommon(files, nextConfig, nextRequest, pathApi) {
  const { config, launch, request, terminal } = files;
  validateBootstrapConfig(config.parsed, request.parsed, { pathApi });
  const identity = identityFromRequest(nextRequest);
  if (request.parsed.nonce !== launch.parsed.nonce
      || request.parsed.requestHash !== launch.parsed.requestHash
      || config.parsed.taskDefinitionHash !== launch.parsed.taskDefinitionHash
      || launch.parsed.nonce !== terminal.parsed.nonce
      || launch.parsed.requestHash !== terminal.parsed.requestHash
      || launch.fact.sha256 !== terminal.parsed.launchSha256
      || config.parsed.taskDefinitionHash !== nextConfig.taskDefinitionHash
      || !samePath(config.parsed.stateRoot, nextConfig.stateRoot, pathApi)
      || !same(config.parsed.identity, identity) || !same(launch.parsed.identity, identity)
      || !same(terminal.parsed.identity, identity)) {
    throw new Error('T152 prior generation identity binding is invalid.');
  }
}

function validateSelfcheck(files, nextRequest) {
  const { launch, request, result, status, terminal } = files;
  const completed = [result.parsed, status.parsed];
  if (nextRequest.phase !== 'g2-path' || request.parsed.phase !== 'bootstrap-selfcheck'
      || launch.parsed.mode !== 'selfcheck' || terminal.parsed.mode !== 'selfcheck'
      || !completed.every((value) => value.nonce === request.parsed.nonce
        && value.mode === 'selfcheck' && value.state === 'completed' && value.exitCode === 0
        && value.productStarted === false && value.formalAttempt === null
        && value.groupAllocated === false)
      || terminal.parsed.exitCode !== 0 || terminal.parsed.productStarted !== false
      || terminal.parsed.formalAttempt !== null || terminal.parsed.groupAllocated !== false
      || terminal.parsed.result?.sha256 !== result.fact.sha256
      || terminal.parsed.status?.sha256 !== status.fact.sha256) {
    throw new Error('T152 prior selfcheck generation is invalid.');
  }
  return null;
}

export function validateFormalPhaseReceipt(receipt, request) {
  if (receipt?.schemaVersion !== 2 || receipt.resultStatus !== 'success'
      || receipt.phase !== request.phase || receipt.action !== request.action
      || receipt.rootId !== request.rootId || receipt.ownerHash !== request.ownerHash
      || receipt.productCommit !== request.productCommit
      || !same(receipt.formalAttempt, request.formalAttempt)
      || !receipt.result || typeof receipt.result !== 'object') {
    throw new Error('T152 formal phase receipt is invalid.');
  }
  return receipt;
}

function allowedSuccessor(previous, next) {
  return (previous === 'g2-path' && next === 'g3-anchor')
    || (previous === 'g3-anchor' && next === 'formal')
    || (previous === 'formal' && next === 'formal');
}

function validateWorker(files, nextRequest, fsApi, pathApi) {
  const request = validateFormalInteractiveRequest(files.request.parsed, { pathApi });
  const { launch, result, status, terminal } = files;
  const expectedReceipt = pathApi.join(request.evidenceRoot, `${request.phase}-receipt.json`);
  if (!allowedSuccessor(request.phase, nextRequest.phase)
      || request.ownerHash !== nextRequest.ownerHash
      || !['baseRoot', 'capsuleRoot', 'controllerRoot', 'evidenceRoot', 'sourceRoot', 'stateRoot']
        .every((name) => samePath(request[name], nextRequest[name], pathApi))
      || launch.parsed.mode !== 'worker' || terminal.parsed.mode !== 'worker'
      || ![result.parsed, status.parsed].every((value) => value.nonce === request.nonce
        && value.state === 'completed' && value.exitCode === 0
        && value.receiptPath === expectedReceipt)
      || terminal.parsed.exitCode !== 0 || terminal.parsed.signal !== null
      || terminal.parsed.spawnError !== null || terminal.parsed.timedOut !== false
      || terminal.parsed.result?.sha256 !== result.fact.sha256
      || terminal.parsed.status?.sha256 !== status.fact.sha256) {
    throw new Error('T152 prior worker generation is invalid.');
  }
  const phaseReceipt = readFile(expectedReceipt, fsApi);
  validateFormalPhaseReceipt(phaseReceipt.parsed, request);
  return { ...phaseReceipt, path: expectedReceipt };
}

function archiveGeneration({ files, phaseReceipt, state, nextRequest, writeJsonAtomic },
  { fsApi, move, pathApi }) {
  const archiveRoot = pathApi.join(nextRequest.evidenceRoot, 'state-generations');
  const archiveDir = pathApi.join(archiveRoot, files.request.parsed.nonce);
  const receiptPath = pathApi.join(archiveDir, 'generation-receipt.json');
  if (fsApi.existsSync(archiveDir)) throw new Error('T152 generation archive already exists.');
  fsApi.mkdirSync(archiveDir, { recursive: true });
  const receipt = { archivedNonce: files.request.parsed.nonce,
    files: Object.fromEntries(SLOT_NAMES.map((name) => [name, files[name].fact])),
    nextNonce: nextRequest.nonce, nextPhase: nextRequest.phase,
    phaseReceipt: phaseReceipt ? { path: phaseReceipt.path, ...phaseReceipt.fact } : null,
    previousPhase: files.request.parsed.phase, schemaVersion: 1 };
  writeJsonAtomic(receiptPath, receipt);
  const receiptFile = readFile(receiptPath, fsApi);
  if (!same(receiptFile.parsed, receipt)) throw new Error('T152 generation archive reread failed.');
  const moved = [];
  try {
    for (const name of SLOT_NAMES) {
      const destination = pathApi.join(archiveDir, pathApi.basename(state[name]));
      move(state[name], destination); moved.push({ destination, name });
    }
  } catch (error) {
    for (const value of moved.reverse()) move(value.destination, state[value.name]);
    throw error;
  }
  if (SLOT_NAMES.some((name) => fsApi.existsSync(state[name]))) {
    throw new Error('T152 prior generation slot was not cleared.');
  }
  for (const { destination, name } of moved) {
    if (readFile(destination, fsApi).fact.sha256 !== files[name].fact.sha256) {
      throw new Error('T152 archived generation changed.');
    }
  }
  return { archiveDir, nonce: files.request.parsed.nonce,
    receipt: receiptFile.fact, receiptPath };
}

export function transitionFormalInteractiveGeneration({ nextConfig, nextRequest, stateRoot,
  writeJsonAtomic }, { fsApi = fs, move = (from, to) => fsApi.renameSync(from, to),
  pathApi = path.win32 } = {}) {
  const state = bootstrapStatePaths(stateRoot);
  const validatedNext = validateFormalInteractiveRequest(nextRequest, { pathApi });
  validateBootstrapConfig(nextConfig, validatedNext, { pathApi });
  verifyT152DesktopDnsSdLibrary({ baseRoot: validatedNext.baseRoot,
    evidenceRoot: validatedNext.evidenceRoot, rootId: validatedNext.rootId,
    sourceRoot: validatedNext.sourceRoot }, validatedNext.ownerReceipt, { pathApi });
  if (!samePath(nextConfig.stateRoot, stateRoot, pathApi)) {
    throw new Error('T152 next generation state root is invalid.');
  }
  const files = Object.fromEntries(SLOT_NAMES.map((name) => [name, readFile(state[name], fsApi)]));
  assertCommon(files, nextConfig, validatedNext, pathApi);
  const phaseReceipt = files.launch.parsed.mode === 'selfcheck'
    ? validateSelfcheck(files, validatedNext)
    : validateWorker(files, validatedNext, fsApi, pathApi);
  return archiveGeneration({ files, nextRequest: validatedNext, phaseReceipt, state, writeJsonAtomic },
    { fsApi, move, pathApi });
}

export function writeAndPreflightFormalGeneration({ config, ownerInput, request, stateRoot,
  writeJsonAtomic }, { fsApi = fs, pathApi = path.win32 } = {}) {
  const state = bootstrapStatePaths(stateRoot);
  if (SLOT_NAMES.some((name) => fsApi.existsSync(state[name]))) {
    throw new Error('T152 fresh generation slot is not empty.');
  }
  writeJsonAtomic(state.request, request);
  writeJsonAtomic(state.status, { nonce: request.nonce, schemaVersion: 2, state: 'pending' });
  writeJsonAtomic(state.config, config);
  if ([state.launch, state.result, state.terminal].some((file) => fsApi.existsSync(file))) {
    throw new Error('T152 fresh generation gained terminal state.');
  }
  const requestFile = readFile(state.request, fsApi); const statusFile = readFile(state.status, fsApi);
  const configFile = readFile(state.config, fsApi);
  const validated = validateFormalInteractiveRequest(requestFile.parsed, { pathApi });
  const owner = verifyT152DesktopDnsSdLibrary(ownerInput, validated.ownerReceipt, { pathApi });
  validateBootstrapConfig(configFile.parsed, validated, { pathApi });
  if (statusFile.parsed.nonce !== validated.nonce || statusFile.parsed.state !== 'pending'
      || configFile.parsed.nonce !== validated.nonce
      || configFile.parsed.requestHash !== validated.requestHash
      || owner.ownerHash !== validated.ownerHash) {
    throw new Error('T152 fresh generation binding is invalid.');
  }
  return { config: configFile.fact, nonce: validated.nonce, ownerHash: owner.ownerHash,
    request: requestFile.fact, status: statusFile.fact };
}
