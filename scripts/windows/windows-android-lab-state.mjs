/* global process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isAndroidLabRunId, safeLabEvidencePath } from './windows-android-lab-evidence.mjs';

export const WINDOWS_ANDROID_LAB_TASK = 'FolioleAndroidLab';
export const WINDOWS_ANDROID_LAB_SOURCE_REF = 'refs/heads/lab/dev';
export const WINDOWS_ANDROID_LAB_PROTOCOL_VERSION = 9;

export function androidLabRoot(env = process.env) {
  if (env.FOLIOLE_WINDOWS_ANDROID_LAB_ROOT) return path.resolve(env.FOLIOLE_WINDOWS_ANDROID_LAB_ROOT);
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Foliole', 'windows-android-lab');
}

export function androidLabPaths(root = androidLabRoot()) {
  const checkout = 'C:\\dev\\foliole-android-lab-preview';
  return {
    active: path.join(root, 'active.json'),
    candidate: checkout,
    checkout,
    checkoutState: path.join(root, 'checkout-state.json'),
    config: path.join(root, 'config.json'),
    deployment: path.join(root, 'deployment.json'),
    device: path.join(root, 'device.json'),
    evidence: path.join(root, 'evidence'),
    manifest: path.join(root, 'protection', 'manifests'),
    preview: checkout,
    protection: path.join(root, 'protection', 'backups'),
    repository: path.join(root, 'repository.git'),
    reviewSession: path.join(root, 'review-session.json'),
    root,
    signingHome: path.join(root, 'signing', 'android-user-home'),
    signingKeystore: path.join(root, 'signing', 'android-user-home', 'debug.keystore'),
    status: path.join(root, 'status.json'),
    workspaceDeployment: path.win32.join(checkout, '.foliole-android-lab-deployment.json')
  };
}

function jsonReadFailure(filePath, payload, error) {
  const stat = fs.statSync(filePath);
  let nulCount = 0;
  for (const byte of payload) if (byte === 0) nulCount += 1;
  return {
    fileName: path.basename(filePath),
    firstNulOffset: payload.indexOf(0),
    leadingHex: payload.subarray(0, 32).toString('hex'),
    modifiedAt: stat.mtime.toISOString(),
    nulCount,
    parseMessage: error.message,
    size: payload.length,
    trailingHex: payload.subarray(Math.max(0, payload.length - 32)).toString('hex')
  };
}

export function isJsonReadFailure(error) {
  return Boolean(error?.jsonReadFailure);
}

export function readJson(filePath, fallback = null) {
  try {
    const payload = fs.readFileSync(filePath);
    try {
      return JSON.parse(payload.toString('utf8').replace(/^\uFEFF/u, ''));
    } catch (error) {
      error.jsonReadFailure = jsonReadFailure(filePath, payload, error);
      throw error;
    }
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

export function parseAndroidLabCommand(input) {
  const parts = String(input || '').trim().split(/\s+/u).filter(Boolean);
  const action = parts.shift();
  if (action === 'run') {
    if (parts.length !== 1 || !/^[0-9a-f]{40}$/u.test(parts[0])) throw new Error('run requires a lowercase 40-character commit SHA');
    return { action, commitSha: parts[0] };
  }
  if (action === 'request') {
    const byteLength = Number(parts[0]);
    if (parts.length !== 2 || !Number.isSafeInteger(byteLength) || byteLength < 2 || byteLength > 1_048_576
      || !/^[0-9a-f]{64}$/u.test(parts[1])) {
      throw new Error('request requires <2..1048576 byte length> <lowercase sha256>');
    }
    return { action, byteLength, sha256: parts[1] };
  }
  if (action === 'review') {
    if (parts[0] === 'scenario' && parts.length === 2 && /^[0-9a-f]{40}$/u.test(parts[1])) {
      return { action: 'reviewScenario', commitSha: parts[1] };
    }
    if (!['prepare', 'capture', 'restart'].includes(parts[0]) || parts.length !== 2
      || !/^[0-9a-f]{40}$/u.test(parts[1])) {
      throw new Error('review requires prepare|capture|restart|scenario and a lowercase 40-character commit SHA');
    }
    return { action, commitSha: parts[1], reviewPhase: parts[0] };
  }
  if (action === 'collect') {
    if (parts[0] === 'list' && parts.length === 1) return { action, operation: 'list' };
    if (parts[0] === 'list' && parts.length === 2 && isAndroidLabRunId(parts[1])) {
      return { action, operation: 'list', runId: parts[1] };
    }
    if (parts[0] === 'get' && parts.length === 2 && isLabEvidenceRelativePath(parts[1])) {
      return { action, operation: 'get', relativePath: parts[1] };
    }
    if (parts[0] === 'get' && parts.length === 3 && isAndroidLabRunId(parts[1]) && isLabEvidenceRelativePath(parts[2])) {
      return { action, operation: 'get', relativePath: parts[2], runId: parts[1] };
    }
    throw new Error('collect requires list [runId] or get [runId] an allowlisted evidence file');
  }
  if (action === 'device') {
    if (parts[0] === 'status' && parts.length === 1) return { action, operation: 'status' };
    if (parts[0] === 'reconnect' && parts.length === 2 && isAndroidEndpoint(parts[1])) {
      return { action, endpoint: parts[1], operation: 'reconnect' };
    }
    throw new Error('device requires status or reconnect <ipv4:port>');
  }
  if (action === 'signing') {
    const byteLength = Number(parts[1]);
    if (parts[0] === 'install' && parts.length === 3 && Number.isSafeInteger(byteLength)
      && byteLength >= 1 && byteLength <= 65_536 && /^[0-9a-f]{64}$/u.test(parts[2])) {
      return { action, byteLength, operation: 'install', sha256: parts[2] };
    }
    throw new Error('signing requires install <1..65536 byte length> <lowercase sha256>');
  }
  if (action === 'selfcheck' && parts.length === 0) return { action };
  if (!['cancel', 'status'].includes(action) || parts.length !== 0) throw new Error('unsupported Android lab action');
  return { action };
}

function isLabEvidenceRelativePath(value) {
  try {
    safeLabEvidencePath('evidence-root', value);
    return true;
  } catch {
    return false;
  }
}

export function isAndroidEndpoint(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/u.exec(String(value || ''));
  if (!match) return false;
  const octets = match[1].split('.').map(Number);
  const port = Number(match[2]);
  return octets.every((octet) => octet >= 0 && octet <= 255) && port >= 1 && port <= 65_535;
}

export function publicLabStatus(status) {
  if (!status) return { protocolVersion: WINDOWS_ANDROID_LAB_PROTOCOL_VERSION, schemaVersion: 1, state: 'idle' };
  const {
    commitSha, completedAt, createdAt, errorCode, errorMessage, mode, phase,
    jsonFile, jsonFirstNulOffset, jsonLeadingHex, jsonModifiedAt, jsonNulCount, jsonSize, jsonTrailingHex,
    requestId, resultStatus, runId, startedAt, state, target
  } = status;
  return {
    commitSha, completedAt, createdAt, errorCode, errorMessage, mode, phase,
    jsonFile, jsonFirstNulOffset, jsonLeadingHex, jsonModifiedAt, jsonNulCount, jsonSize, jsonTrailingHex,
    protocolVersion: WINDOWS_ANDROID_LAB_PROTOCOL_VERSION, requestId, resultStatus,
    runId, schemaVersion: 1, startedAt, state, target
  };
}

export function publicDeviceStatus(device) {
  if (!device) return { schemaVersion: 1, state: 'unconfigured' };
  const { discoverySource, endpoint, identity, verifiedAt } = device;
  return { discoverySource, endpoint, identity, schemaVersion: 1, state: 'configured', verifiedAt };
}

export function writeSuccessfulDeployment(paths, request, device, completedAt) {
  const marker = {
    commitSha: request.commitSha, completedAt, deviceIdentity: device.identity,
    runId: request.runId, schemaVersion: 1, sourceKind: request.sourceKind || 'unknown'
  };
  if (!fs.existsSync(path.dirname(paths.workspaceDeployment))) {
    throw Object.assign(new Error('deployed preview workspace is missing'), { code: 'deployed_workspace_missing' });
  }
  writeJsonAtomic(paths.workspaceDeployment, marker);
  writeJsonAtomic(paths.deployment, marker);
  return marker;
}

export function parseReadyDevices(output) {
  return String(output || '')
    .split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => parts[0]);
}

export function assertExclusiveDevice(output, expectedSerial) {
  const ready = parseReadyDevices(output);
  if (ready.length !== 1 || ready[0] !== expectedSerial) {
    const error = new Error(`expected exactly one ready Android device (${expectedSerial}); found ${ready.join(',') || 'none'}`);
    error.code = 'android_device_not_exclusive';
    throw error;
  }
}
