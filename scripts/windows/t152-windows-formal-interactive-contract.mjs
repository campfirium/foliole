import { createHash } from 'node:crypto';
import path from 'node:path';

export const PRODUCT_COMMIT = '86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a';
export const PRODUCT_TREE = 'ec8af4a625d98fb35e86134d8770c50a5e669ccb';
export const T7_RUN = '33270551363';
export const ADMISSION_ACTION = 't152-prejourney-admission';
export const FORMAL_ACTIONS = new Set([
  'desktop-dnssd-advertise-acceptance', 'desktop-dnssd-find-acceptance',
  'desktop-dnssd-route-provider', 'single-principal-sync-group',
  't152-desktop-dnssd-advertise-checkpoint', 't152-desktop-dnssd-find-checkpoint',
  'two-device-sync-provider'
]);
export const PHASES = new Set(['g2-path', 'g3-anchor', 'formal']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function payload(request) {
  const claims = { ...request };
  delete claims.requestHash;
  return claims;
}

export function formalRequestHash(request) {
  return createHash('sha256').update(canonicalJson(payload(request))).digest('hex');
}

export function formalLaunchEnvHash({ sourceRoot, stateRoot, taskRoot }) {
  return createHash('sha256').update(canonicalJson({ sourceRoot, stateRoot, taskRoot })).digest('hex');
}

export function createFormalInteractiveRequest(input) {
  const request = { ...input, productCommit: PRODUCT_COMMIT, productTree: PRODUCT_TREE,
    schemaVersion: 2, t7Run: T7_RUN };
  return { ...request, requestHash: formalRequestHash(request) };
}

function samePath(left, right, pathApi) {
  return pathApi.normalize(left).toLowerCase() === pathApi.normalize(right).toLowerCase();
}

function validFormalIdentity(request) {
  if (request.phase !== 'formal') {
    return request.action === ADMISSION_ACTION && request.attemptId === undefined
      && request.expectedGroupId === undefined && request.expectedGroupTag === undefined
      && request.formalAttempt?.allocated === false && request.formalAttempt?.started === false;
  }
  const expected = ['desktop-dnssd-find-acceptance', 'single-principal-sync-group',
    't152-desktop-dnssd-find-checkpoint'].includes(request.action);
  const providerExpected = request.action === 't152-desktop-dnssd-find-checkpoint';
  return FORMAL_ACTIONS.has(request.action) && request.attemptId === request.rootId
    && request.formalAttempt?.allocated === true && request.formalAttempt?.started === true
    && (expected
      ? /^group-[0-9a-f-]{36}$/u.test(request.expectedGroupId ?? '')
        && /^[0-9a-f]{32}$/u.test(request.expectedGroupTag ?? '')
        && (!providerExpected || typeof request.expectedProviderDeviceId === 'string'
          && request.expectedProviderDeviceId.length > 0)
      : request.expectedGroupId === undefined && request.expectedGroupTag === undefined);
}

function validRoots(request, pathApi) {
  const roots = ['baseRoot', 'capsuleRoot', 'controllerRoot', 'evidenceRoot', 'sourceRoot',
    'stateRoot'];
  return roots.every((key) => pathApi.isAbsolute(request[key] ?? ''))
    && Array.isArray(request.protectedRoots) && request.protectedRoots.length >= 4
    && request.protectedRoots.every((root) => pathApi.isAbsolute(root ?? ''))
    && samePath(request.ownerReceipt?.baseRoot, request.baseRoot, pathApi)
    && samePath(request.ownerReceipt?.evidenceRoot, request.evidenceRoot, pathApi)
    && samePath(request.ownerReceipt?.sourceRoot, request.sourceRoot, pathApi)
    && request.ownerReceipt?.rootId === request.rootId
    && request.ownerReceipt?.ownerHash === request.ownerHash;
}

export function validateFormalInteractiveRequest(request, { pathApi = path.win32 } = {}) {
  if (request?.schemaVersion !== 2 || !PHASES.has(request.phase)
      || !UUID.test(request.rootId ?? '') || !UUID.test(request.capsuleId ?? '')
      || !UUID.test(request.nonce ?? '') || !COMMIT.test(request.controllerCommit ?? '')
      || !COMMIT.test(request.controllerTree ?? '') || !SHA.test(request.ownerHash ?? '')
      || !SHA.test(request.launchEnvHash ?? '') || request.productCommit !== PRODUCT_COMMIT
      || request.productTree !== PRODUCT_TREE || request.t7Run !== T7_RUN
      || request.requestHash !== formalRequestHash(request) || !validFormalIdentity(request)
      || !validRoots(request, pathApi)) {
    throw new Error('T152 formal interactive request is invalid.');
  }
  return request;
}

export function reconstructFormalPaths(request, windowsDevPaths) {
  return { ...windowsDevPaths({ repoRoot: request.sourceRoot }),
    acceptanceRepoRoot: request.ownerReceipt.taskRoot, controlRepoRoot: request.sourceRoot };
}
