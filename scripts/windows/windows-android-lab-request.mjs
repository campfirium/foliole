import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isAndroidEndpoint } from './windows-android-lab-state.mjs';

const MAX_REQUEST_BYTES = 1_048_576;
const MAX_TIMEOUT_MS = 45 * 60_000;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const SAFE_RELATIVE = /^(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[A-Za-z0-9._/\\-]*$/u;

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertStringList(values, label) {
  if (!Array.isArray(values) || values.length > 64 || values.some((value) => (
    typeof value !== 'string' || value.length > 4096 || value.includes('\0')
  ))) throw codedError('request_invalid', `${label} must be a bounded string array`);
}

function assertRelative(value, label, { allowEmpty = true } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value) || value.length > 240
    || path.win32.isAbsolute(value) || path.posix.isAbsolute(value) || !SAFE_RELATIVE.test(value)) {
    throw codedError('request_cwd_rejected', `${label} must stay within its declared Lab scope`);
  }
}

function validateCwd(cwd) {
  if (!cwd || !['checkout', 'lab', 'run'].includes(cwd.scope)) {
    throw codedError('request_cwd_rejected', 'cwd scope must be checkout, lab, or run');
  }
  assertRelative(cwd.path || '', 'cwd path');
}

function validateRepository(operation) {
  assertRelative(operation.runner, 'repository runner', { allowEmpty: false });
  if (!/^scripts[\\/].+\.(?:mjs|ps1)$/u.test(operation.runner)) {
    throw codedError('request_runner_rejected', 'repository runner must be a committed script');
  }
  assertStringList(operation.args || [], 'repository args');
}

function validateDiagnostic(operation) {
  if (!['node', 'powershell'].includes(operation.runtime)) {
    throw codedError('request_invalid', 'diagnostic runtime must be node or powershell');
  }
  if (!/^[A-Za-z0-9._-]{1,80}\.(?:mjs|ps1)$/u.test(operation.fileName || '')) {
    throw codedError('request_invalid', 'diagnostic fileName is invalid');
  }
  if (!/^[0-9a-f]{64}$/u.test(operation.contentSha256 || '')) {
    throw codedError('request_invalid', 'diagnostic content hash is invalid');
  }
  const content = Buffer.from(operation.contentBase64 || '', 'base64');
  if (content.length < 1 || content.length > 524_288
    || createHash('sha256').update(content).digest('hex') !== operation.contentSha256) {
    throw codedError('request_hash_mismatch', 'diagnostic content does not match its hash');
  }
  assertStringList(operation.args || [], 'diagnostic args');
}

function assertOperation(envelope) {
  const operation = envelope.operation;
  if (!operation || !['adb', 'androidDevServer', 'diagnostic', 'read', 'repository', 'windowsClient', 'deviceReconnect'].includes(operation.kind)) {
    throw codedError('request_invalid', 'request operation kind is unsupported');
  }
  if (operation.kind === 'repository') validateRepository(operation);
  if (operation.kind === 'adb') {
    assertStringList(operation.args, 'ADB args');
    if (operation.args.some((arg) => ['-s', '--serial'].includes(arg))) {
      throw codedError('request_serial_rejected', 'ADB serial is worker-owned');
    }
  }
  if (operation.kind === 'windowsClient' && !['status', 'start', 'stop', 'restart', 'full-restart'].includes(operation.action)) {
    throw codedError('request_invalid', 'Windows client action is unsupported');
  }
  if (operation.kind === 'androidDevServer' && !['status', 'start', 'stop', 'restart'].includes(operation.action)) {
    throw codedError('request_invalid', 'Android dev-server action is unsupported');
  }
  if (operation.kind === 'read') assertRelative(operation.path, 'read path', { allowEmpty: false });
  if (operation.kind === 'deviceReconnect' && !isAndroidEndpoint(operation.endpoint)) {
    throw codedError('request_invalid', 'device reconnect endpoint is required');
  }
  if (operation.kind === 'diagnostic') validateDiagnostic(operation);
  if (['repository', 'windowsClient', 'androidDevServer'].includes(operation.kind) && envelope.cwd.scope !== 'checkout') {
    throw codedError('request_cwd_rejected', `${operation.kind} requests require checkout cwd`);
  }
  if (operation.kind === 'diagnostic' && envelope.cwd.scope !== 'run') {
    throw codedError('request_cwd_rejected', 'diagnostic requests require run-scoped cwd');
  }
  if (['adb', 'deviceReconnect'].includes(operation.kind) && envelope.target !== 'a5') {
    throw codedError('request_invalid', `${operation.kind} requests require the A5 target`);
  }
  if (operation.kind === 'windowsClient' && envelope.target !== 'windows') {
    throw codedError('request_invalid', 'Windows client requests require the Windows target');
  }
  if (operation.kind === 'androidDevServer' && envelope.target !== 'a5') {
    throw codedError('request_invalid', 'Android dev-server requests require the A5 target');
  }
}

function dangerousReason(envelope) {
  const operation = envelope.operation;
  const command = operation.kind === 'diagnostic'
    ? Buffer.from(operation.contentBase64, 'base64').toString('utf8')
    : operation.kind === 'adb' ? operation.args.join(' ') : '';
  const destructive = /(?:\bpm\s+clear\b|\buninstall\b|\b(?:root|remount|disable-verity|reboot|sideload|restore)\b|\b(?:Remove-Item|Clear-Content|Format-Volume|Set-NetFirewallRule|New-NetFirewallRule|Start-Process\b[^\n]*\bRunAs)\b)/iu;
  if (destructive.test(command)) return 'request contains a destructive, privileged, or system-level operation';
  if (operation.kind === 'read' && envelope.cwd.scope !== 'lab' && envelope.cwd.scope !== 'checkout') {
    return 'file reads are limited to Lab or commit-bound checkout roots';
  }
  return null;
}

export function validateAndroidLabEnvelope(value) {
  if (!value || value.schemaVersion !== 1 || !REQUEST_ID.test(value.requestId || '') || !SHA.test(value.commitSha || '')) {
    throw codedError('request_invalid', 'request identity, schema, or commit is invalid');
  }
  if (!['automation', 'diagnostic'].includes(value.mode) || !['windows', 'a5'].includes(value.target)) {
    throw codedError('request_invalid', 'request mode or target is invalid');
  }
  if (!Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1_000 || value.timeoutMs > MAX_TIMEOUT_MS) {
    throw codedError('request_invalid', 'request timeout is outside the allowed range');
  }
  validateCwd(value.cwd);
  assertOperation(value);
  if ((value.operation.kind === 'diagnostic') !== (value.mode === 'diagnostic')) {
    throw codedError('request_invalid', 'diagnostic mode and operation must match');
  }
  const reason = dangerousReason(value);
  if (reason) throw codedError('approval_required', reason);
  return value;
}

export function parseAndroidLabEnvelope(payload, expectedLength, expectedSha256) {
  if (!Buffer.isBuffer(payload) || payload.length !== expectedLength || payload.length > MAX_REQUEST_BYTES) {
    throw codedError('request_length_mismatch', 'request payload length does not match');
  }
  const sha256 = createHash('sha256').update(payload).digest('hex');
  if (sha256 !== expectedSha256) throw codedError('request_hash_mismatch', 'request payload hash does not match');
  let value;
  try { value = JSON.parse(payload.toString('utf8')); } catch { throw codedError('request_invalid', 'request payload is not JSON'); }
  return { envelope: validateAndroidLabEnvelope(value), sha256 };
}

export function loadAndroidLabEnvelope(filePath) {
  const resolved = path.resolve(filePath);
  const value = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (value?.operation?.kind === 'diagnostic' && value.operation.sourcePath) {
    const content = fs.readFileSync(path.resolve(path.dirname(resolved), value.operation.sourcePath));
    value.operation = {
      ...value.operation, contentBase64: content.toString('base64'),
      contentSha256: createHash('sha256').update(content).digest('hex'),
      fileName: value.operation.fileName || path.basename(value.operation.sourcePath)
    };
    delete value.operation.sourcePath;
  }
  validateAndroidLabEnvelope(value);
  const payload = Buffer.from(`${JSON.stringify(value)}\n`);
  if (payload.length > MAX_REQUEST_BYTES) throw codedError('request_too_large', 'request payload is too large');
  return { envelope: value, payload, sha256: createHash('sha256').update(payload).digest('hex') };
}
