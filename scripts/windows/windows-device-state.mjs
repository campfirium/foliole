/* global process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WINDOWS_DEVICE_TASK_NAME = 'FoliolePhysicalAcceptance';
export const WINDOWS_DEVICE_ACTIONS = new Set(['cancel', 'collect', 'deploy', 'sleep', 'status']);

export function deviceRoot(env = process.env) {
  if (env.FOLIOLE_WINDOWS_DEVICE_ROOT) return path.resolve(env.FOLIOLE_WINDOWS_DEVICE_ROOT);
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Foliole', 'windows-device');
}

export function devicePaths(root = deviceRoot()) {
  return {
    active: path.join(root, 'active.json'),
    artifact: path.join(root, 'artifact.zip'),
    candidate: path.join(root, 'candidate'),
    githubToken: path.join(root, 'github-token.txt'),
    root,
    status: path.join(root, 'status.json')
  };
}

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function parsePositiveInteger(value, label) {
  if (!/^[1-9][0-9]*$/u.test(value || '')) throw new Error(`${label} must be a positive integer`);
  return value;
}

export function parseDeviceCommand(input) {
  const parts = String(input || '').trim().split(/\s+/u).filter(Boolean);
  const action = parts.shift();
  if (!WINDOWS_DEVICE_ACTIONS.has(action)) throw new Error('unsupported device action');
  if (action === 'deploy') {
    if (parts.length !== 2) throw new Error('deploy requires run-id commit-sha');
    const [runId, commitSha] = parts;
    parsePositiveInteger(runId, 'run-id');
    if (!/^[0-9a-f]{40}$/u.test(commitSha)) throw new Error('commit-sha must be a lowercase 40-character SHA');
    return { action, commitSha, runId };
  }
  if (action === 'collect') {
    if (parts.length < 1 || parts.length > 2 || !['get', 'list'].includes(parts[0])) throw new Error('collect requires list or get RELATIVE_PATH');
    if (parts[0] === 'get' && (!parts[1] || !/^[A-Za-z0-9._/-]+$/u.test(parts[1]))) throw new Error('invalid evidence path');
    if (parts[0] === 'list' && parts.length !== 1) throw new Error('collect list takes no path');
    return { action, operation: parts[0], relativePath: parts[1] };
  }
  if (parts.length !== 0) throw new Error(`${action} takes no arguments`);
  return { action };
}

export function taskIdentity(request) {
  return `${request.commitSha}:${request.runId}`;
}

export function isBusy(status, request) {
  if (!status || !['pending', 'running'].includes(status.state)) return false;
  return status.identity !== taskIdentity(request);
}

export function publicStatus(status) {
  if (!status) return { schemaVersion: 1, state: 'idle' };
  const { completedAt, errorCode, errorMessage, identity, phase, resultStatus, startedAt, state } = status;
  return { completedAt, errorCode, errorMessage, identity, phase, resultStatus, schemaVersion: 1, startedAt, state };
}

export function safeEvidencePath(evidenceRoot, relativePath) {
  if (!evidenceRoot) throw new Error('evidence is unavailable');
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error('evidence path escapes result root');
  const resolvedRoot = path.resolve(evidenceRoot);
  const resolved = path.resolve(resolvedRoot, normalized);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('evidence path escapes result root');
  return resolved;
}
