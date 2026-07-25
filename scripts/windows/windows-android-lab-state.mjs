/* global process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WINDOWS_ANDROID_LAB_TASK = 'FolioleAndroidLab';
export const WINDOWS_ANDROID_LAB_SOURCE_REF = 'refs/heads/lab/dev';
export const LAB_EVIDENCE_FILES = new Set(['logcat.txt', 'runner.log', 'screenshot.png', 'summary.json']);

export function androidLabRoot(env = process.env) {
  if (env.FOLIOLE_WINDOWS_ANDROID_LAB_ROOT) return path.resolve(env.FOLIOLE_WINDOWS_ANDROID_LAB_ROOT);
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Foliole', 'windows-android-lab');
}

export function androidLabPaths(root = androidLabRoot()) {
  return {
    active: path.join(root, 'active.json'),
    candidate: path.join(root, 'candidate'),
    config: path.join(root, 'config.json'),
    device: path.join(root, 'device.json'),
    evidence: path.join(root, 'evidence'),
    manifest: path.join(root, 'protection', 'manifests'),
    preview: 'C:\\dev\\foliole-android-lab-preview',
    protection: path.join(root, 'protection', 'backups'),
    repository: path.join(root, 'repository.git'),
    root,
    signingHome: path.join(root, 'signing', 'android-user-home'),
    signingKeystore: path.join(root, 'signing', 'android-user-home', 'debug.keystore'),
    status: path.join(root, 'status.json')
  };
}

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, ''));
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
  if (action === 'collect') {
    if (parts[0] === 'list' && parts.length === 1) return { action, operation: 'list' };
    if (parts[0] === 'get' && parts.length === 2 && LAB_EVIDENCE_FILES.has(parts[1])) {
      return { action, operation: 'get', relativePath: parts[1] };
    }
    throw new Error('collect requires list or get summary.json|runner.log|logcat.txt|screenshot.png');
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
  if (!['cancel', 'status'].includes(action) || parts.length !== 0) throw new Error('unsupported Android lab action');
  return { action };
}

export function isAndroidEndpoint(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/u.exec(String(value || ''));
  if (!match) return false;
  const octets = match[1].split('.').map(Number);
  const port = Number(match[2]);
  return octets.every((octet) => octet >= 0 && octet <= 255) && port >= 1 && port <= 65_535;
}

export function publicLabStatus(status) {
  if (!status) return { schemaVersion: 1, state: 'idle' };
  const { commitSha, completedAt, createdAt, errorCode, errorMessage, phase, resultStatus, runId, startedAt, state } = status;
  return { commitSha, completedAt, createdAt, errorCode, errorMessage, phase, resultStatus, runId, schemaVersion: 1, startedAt, state };
}

export function publicDeviceStatus(device) {
  if (!device) return { schemaVersion: 1, state: 'unconfigured' };
  const { discoverySource, endpoint, identity, verifiedAt } = device;
  return { discoverySource, endpoint, identity, schemaVersion: 1, state: 'configured', verifiedAt };
}

export function safeLabEvidencePath(evidenceRoot, relativePath) {
  if (!evidenceRoot || !LAB_EVIDENCE_FILES.has(relativePath)) throw new Error('evidence file is not allowed');
  return path.join(evidenceRoot, relativePath);
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
