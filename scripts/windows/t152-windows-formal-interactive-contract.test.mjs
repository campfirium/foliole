// @vitest-environment node

import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

import { ADMISSION_ACTION, createFormalInteractiveRequest,
  reconstructFormalPaths, validateFormalInteractiveRequest } from
  './t152-windows-formal-interactive-contract.mjs';

const ROOT = '11111111-1111-4111-8111-111111111111';
const CAPSULE = '22222222-2222-4222-8222-222222222222';
const NONCE = '33333333-3333-4333-8333-333333333333';
const HASH = createHash('sha256').update('owner').digest('hex');

function request(phase = 'g2-path') {
  const baseRoot = 'X:\\owned';
  const evidenceRoot = 'Y:\\evidence';
  const sourceRoot = 'Z:\\capsule\\source';
  const ownerReceipt = { baseRoot, evidenceRoot, ownerHash: HASH, rootId: ROOT,
    sourceRoot, taskRoot: 'X:\\owned\\task', libraryRoot: 'X:\\owned\\task\\library' };
  return createFormalInteractiveRequest({ action: ADMISSION_ACTION, baseRoot,
    capsuleId: CAPSULE, capsuleRoot: 'Z:\\capsule', controllerCommit: 'a'.repeat(40),
    controllerRoot: 'W:\\controller', controllerTree: 'b'.repeat(40),
    createdAt: '2026-08-30T00:00:00.000Z', evidenceRoot,
    formalAttempt: { allocated: false, started: false }, launchEnvHash: HASH,
    nonce: NONCE, ownerHash: HASH, ownerReceipt, phase,
    protectedRoots: [sourceRoot, evidenceRoot, 'W:\\controller', 'Z:\\capsule'], rootId: ROOT,
    sourceRoot, stateRoot: 'Y:\\state' });
}

it('accepts dynamic admission roots and projects only the owner task root', () => {
  const value = validateFormalInteractiveRequest(request());
  const paths = reconstructFormalPaths(value, ({ repoRoot }) => ({ repoRoot }));
  expect(paths).toEqual({ acceptanceRepoRoot: value.ownerReceipt.taskRoot,
    controlRepoRoot: value.sourceRoot, repoRoot: value.sourceRoot });
});

it('accepts only an optional trailing separator on the same canonical root', () => {
  const value = request();
  value.baseRoot = `${value.baseRoot}\\`;
  const signed = createFormalInteractiveRequest(value);
  expect(validateFormalInteractiveRequest(signed).baseRoot).toBe('X:\\owned\\');
});

it.each([
  ['different drive', 'Q:\\owned'],
  ['UNC instead of drive', '\\\\server\\share\\owned'],
  ['adjacent prefix', 'X:\\owned-copy'],
  ['parent', 'X:\\'],
  ['child', 'X:\\owned\\child'],
  ['relative', 'owned'],
  ['escaped', 'X:\\owned\\..\\escape']
])('rejects %s as a different owner root', (_label, baseRoot) => {
  const value = request();
  value.baseRoot = baseRoot;
  expect(() => validateFormalInteractiveRequest(createFormalInteractiveRequest(value)))
    .toThrow('request is invalid');
});

it.each([
  ['missing root', (value) => { delete value.baseRoot; }],
  ['changed UUID', (value) => { value.rootId = NONCE; }],
  ['changed receipt', (value) => { value.ownerReceipt.taskRoot = 'Q:\\escape'; }],
  ['formal early', (value) => { value.formalAttempt.allocated = true; }],
  ['default path', (value) => { value.sourceRoot = ''; }]
])('rejects %s before product launch', (_label, mutate) => {
  const value = request();
  mutate(value);
  expect(() => validateFormalInteractiveRequest(value)).toThrow('request is invalid');
});

it('rejects a formal action unless the same root UUID is atomically promoted', () => {
  const value = request('formal');
  value.action = 'desktop-dnssd-advertise-acceptance';
  value.formalAttempt = { allocated: true, started: true };
  value.attemptId = ROOT;
  expect(() => validateFormalInteractiveRequest(value)).toThrow();
  const signed = createFormalInteractiveRequest(value);
  expect(validateFormalInteractiveRequest(signed).attemptId).toBe(ROOT);
});

it('requires the exact provider Device for the pre-request discovery checkpoint', () => {
  const value = request('formal');
  Object.assign(value, { action: 't152-desktop-dnssd-find-checkpoint', attemptId: ROOT,
    expectedGroupId: `group-${ROOT}`, expectedGroupTag: 'c'.repeat(32),
    formalAttempt: { allocated: true, started: true } });
  expect(() => validateFormalInteractiveRequest(createFormalInteractiveRequest(value))).toThrow();
  value.expectedProviderDeviceId = '["sync-group-device-v1","group","anchor","path"]';
  expect(validateFormalInteractiveRequest(createFormalInteractiveRequest(value)).action)
    .toBe('t152-desktop-dnssd-find-checkpoint');
});
