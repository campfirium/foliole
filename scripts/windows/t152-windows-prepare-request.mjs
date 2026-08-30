import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import path from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
}

export function canonicalPrepareJson(value) {
  return JSON.stringify(ordered(value));
}

export function remoteT152CapsulePaths(facts, capsuleId) {
  const capsuleRoot = path.win32.join(facts.roots.localAppData, capsuleId);
  return { capsuleRoot, controllerRoot: path.win32.join(capsuleRoot, 'controller'),
    evidenceRoot: path.win32.join(capsuleRoot, 'evidence', 'prepare'),
    sourceRoot: path.win32.join(capsuleRoot, 'source'), taskBaseRoot: facts.roots.temp };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validateRequest(request) {
  const paths = ['capsuleRoot', 'controllerArchivePath', 'controllerRoot', 'evidenceRoot',
    'manifestPath', 'nodePath', 'npmPath', 'productArchivePath', 'sourceRoot', 'tarPath'];
  if (request.schemaVersion !== 1 || !UUID.test(request.capsuleId ?? '')
      || !UUID.test(request.rootId ?? '') || !paths.every((key) => path.win32.isAbsolute(
        request[key] ?? '')) || !/^[0-9a-f]{64}$/u.test(request.hostFactsSha256 ?? '')
      || !/^[0-9a-f]{40}$/u.test(request.identity?.controllerCommit ?? '')
      || !/^[0-9a-f]{40}$/u.test(request.identity?.controllerTree ?? '')) {
    throw new Error('T152 prepare request is invalid');
  }
  return request;
}

export function createT152WindowsPrepareRequest(input) {
  const request = validateRequest({ ...input, schemaVersion: 1 });
  const requestJson = canonicalPrepareJson(request);
  const requestSha256 = sha256(requestJson);
  const token = Buffer.from(canonicalPrepareJson({ requestJson, requestSha256 }), 'utf8')
    .toString('base64url');
  if (!/^[A-Za-z0-9_-]+$/u.test(token) || token.includes('=')) {
    throw new Error('T152 prepare token is not unpadded base64url');
  }
  return { request, requestJson, requestSha256, token };
}

export function decodeT152WindowsPrepareRequest(token) {
  if (!/^[A-Za-z0-9_-]+$/u.test(token ?? '')) throw new Error('T152 prepare token is invalid');
  const envelope = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  if (sha256(envelope.requestJson ?? '') !== envelope.requestSha256) {
    throw new Error('T152 prepare request hash mismatch');
  }
  const request = validateRequest(JSON.parse(envelope.requestJson));
  if (canonicalPrepareJson(request) !== envelope.requestJson) {
    throw new Error('T152 prepare request is not canonical');
  }
  return { request, requestSha256: envelope.requestSha256 };
}

export function t152PrepareRemoteCommand(scriptPath, action, token) {
  if (!['binding-preflight', 'prepare'].includes(action)
      || !path.win32.isAbsolute(scriptPath ?? '') || !/^[A-Za-z0-9_-]+$/u.test(token ?? '')) {
    throw new Error('T152 prepare remote command is invalid');
  }
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath, '-Action', action, '-RequestBase64', token];
}
