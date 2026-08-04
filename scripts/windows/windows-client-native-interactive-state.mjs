/* global process */

import fs from 'node:fs';
import path from 'node:path';

export const WINDOWS_NATIVE_CLIENT_TASK = 'FolioleNativeClient';
export const WINDOWS_NATIVE_CLIENT_WORKER_ENV = 'FOLIOLE_NATIVE_CLIENT_INTERACTIVE_WORKER';
export const INTERACTIVE_ACTIONS = new Set(['start', 'restart', 'full-restart']);

export function interactiveStatePaths(stateRoot) {
  return {
    request: path.join(stateRoot, 'request.json'),
    result: path.join(stateRoot, 'result.json'),
    status: path.join(stateRoot, 'status.json')
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

export function validateInteractiveRequest(request) {
  if (request?.schemaVersion !== 1 || !INTERACTIVE_ACTIONS.has(request.action)
      || !/^[0-9a-f-]{36}$/u.test(request.nonce || '')) {
    throw new Error('invalid native client interactive request');
  }
  return request;
}
