import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { verifyT152DesktopDnsSdLibrary } from '../desktop/t152-desktop-dnssd-library.mjs';
import { bootstrapStatePaths, validateBootstrapConfig } from
  './t152-windows-formal-interactive-bootstrap.mjs';
import { validateFormalInteractiveRequest } from './t152-windows-formal-interactive-contract.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

function readFile(file, fsApi) {
  const stat = fsApi.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('T152 generation file is invalid.');
  const bytes = fsApi.readFileSync(file);
  return { bytes, parsed: JSON.parse(bytes.toString('utf8')),
    fact: { exists: true, sha256: digest(bytes), size: bytes.length } };
}

function completedSelfcheck(files) {
  const { launch, result, status, terminal } = files;
  const nonce = launch.parsed.nonce;
  const completed = [result.parsed, status.parsed];
  return launch.parsed.mode === 'selfcheck' && completed.every((value) =>
    value.nonce === nonce && value.mode === 'selfcheck' && value.state === 'completed'
      && value.exitCode === 0 && value.productStarted === false
      && value.formalAttempt === null && value.groupAllocated === false)
    && terminal.parsed.nonce === nonce && terminal.parsed.mode === 'selfcheck'
    && terminal.parsed.exitCode === 0 && terminal.parsed.productStarted === false
    && terminal.parsed.formalAttempt === null && terminal.parsed.groupAllocated === false
    && terminal.parsed.launchSha256 === launch.fact.sha256
    && terminal.parsed.result?.sha256 === result.fact.sha256
    && terminal.parsed.status?.sha256 === status.fact.sha256;
}

export function transitionCompletedSelfcheck(stateRoot, {
  fsApi = fs, remove = (file) => fsApi.unlinkSync(file)
} = {}) {
  const state = bootstrapStatePaths(stateRoot);
  const files = Object.fromEntries(['launch', 'result', 'status', 'terminal']
    .map((name) => [name, readFile(state[name], fsApi)]));
  if (!completedSelfcheck(files)) throw new Error('T152 prior selfcheck generation is invalid.');
  const slot = [state.request, state.config, state.launch, state.result, state.status, state.terminal];
  if (!slot.every((file) => fsApi.existsSync(file))) {
    throw new Error('T152 prior selfcheck slot is incomplete.');
  }
  for (const file of slot) remove(file);
  if (slot.some((file) => fsApi.existsSync(file))) {
    throw new Error('T152 prior selfcheck slot was not cleared.');
  }
  return { cleared: slot, nonce: files.launch.parsed.nonce,
    receipts: Object.fromEntries(Object.entries(files).map(([name, value]) => [name, value.fact])) };
}

export function writeAndPreflightFormalGeneration({ config, ownerInput, request, stateRoot,
  writeJsonAtomic }, { fsApi = fs, pathApi = path.win32 } = {}) {
  const state = bootstrapStatePaths(stateRoot);
  if ([state.launch, state.result, state.terminal].some((file) => fsApi.existsSync(file))) {
    throw new Error('T152 fresh generation contains terminal state.');
  }
  writeJsonAtomic(state.request, request);
  writeJsonAtomic(state.status, { nonce: request.nonce, schemaVersion: 2, state: 'pending' });
  writeJsonAtomic(state.config, config);
  if ([state.launch, state.result, state.terminal].some((file) => fsApi.existsSync(file))) {
    throw new Error('T152 fresh generation gained terminal state.');
  }
  const requestFile = readFile(state.request, fsApi);
  const statusFile = readFile(state.status, fsApi);
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
