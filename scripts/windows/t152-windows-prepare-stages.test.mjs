// @vitest-environment node

import { expect, it } from 'vitest';

import { PREPARE_DEADLINE_MS, PREPARE_STAGES, validateBindingPreflight,
  validatePrepareStageReceipt } from
  './t152-windows-prepare-stages.mjs';

const IDENTITY = { controllerCommit: 'a'.repeat(40), controllerTree: 'b'.repeat(40),
  productCommit: 'c'.repeat(40), productTree: 'd'.repeat(40), t7Run: '1' };

function expected(stage = 'materialize') {
  return { capsuleId: '22222222-2222-4222-8222-222222222222',
    capsuleRoot: 'C:\\Owned\\Capsule', hostFactsSha256: '9'.repeat(64), identity: IDENTITY,
    predecessorReceiptSha256: null, requestSha256: 'e'.repeat(64),
    rootId: '11111111-1111-4111-8111-111111111111', stage, tokenSha256: 'f'.repeat(64) };
}

function receipt(stage = 'materialize') {
  return { ...expected(stage), rawExit: 0, rawSignal: null, resultStatus: 'success' };
}

it('pins one ordered stage machine and one non-resetting 45-minute deadline', () => {
  expect(PREPARE_STAGES).toEqual(['materialize', 'dependencies', 'electron-runtime', 'build',
    'electron-compile', 'native', 'package', 'finalize']);
  expect(PREPARE_DEADLINE_MS).toBe(45 * 60 * 1000);
});

it('accepts a terminal receipt only when every binding and predecessor matches', () => {
  expect(validatePrepareStageReceipt(receipt(), expected())).toEqual(receipt());
  expect(() => validatePrepareStageReceipt({ ...receipt(), requestSha256: '0'.repeat(64) },
    expected())).toThrow('receipt is invalid');
  expect(() => validatePrepareStageReceipt({ ...receipt(), predecessorReceiptSha256: '1' },
    expected())).toThrow('receipt is invalid');
});

it('rejects failed, signalled, duplicate-stage, and identity-tampered receipts', () => {
  expect(() => validatePrepareStageReceipt({ ...receipt(), resultStatus: 'failed' }, expected()))
    .toThrow();
  expect(() => validatePrepareStageReceipt({ ...receipt(), rawSignal: 'SIGTERM' }, expected()))
    .toThrow();
  expect(() => validatePrepareStageReceipt({ ...receipt('build'), stage: 'dependencies' },
    expected('build'))).toThrow();
  expect(() => validatePrepareStageReceipt({ ...receipt(), identity: {
    ...IDENTITY, controllerCommit: '0'.repeat(40) } }, expected())).toThrow();
});

function bindingFixture() {
  const fields = ['capsuleRoot', 'controllerArchivePath', 'controllerRoot', 'evidenceRoot',
    'manifestPath', 'nodePath', 'npmPath', 'prepareHelperPath', 'productArchivePath',
    'sourceRoot', 'tarPath'];
  const request = Object.fromEntries(fields.map((field) => [field, `X:\\Owner Space\\资料\\${field}`]));
  const normalizedPaths = Object.fromEntries(fields.map((field) => [field,
    { localRoot: 'X:\\', normalized: request[field], value: request[field] }]));
  const parsed = { pathPredicate: { clrVersion: '4.0.30319.42000', normalizedPaths,
    powershellVersion: '5.1.26100.7705', schemaSha256: 'a'.repeat(64), selfcheck: { rejected: {
      driveRelative: true, normalizationMismatch: true, relative: true, rootRelative: true,
      uri: true } } }, requestSha256: 'b'.repeat(64), runtimeExact: true,
  runtimeExists: { node: true, npm: true, tar: true } };
  return { parsed, request };
}

it('requires every normalized owner path and every dynamic negative rejection', () => {
  const { parsed, request } = bindingFixture();
  expect(validateBindingPreflight(parsed, request, 'b'.repeat(64))).toBe(parsed);
  parsed.pathPredicate.normalizedPaths.sourceRoot.normalized += '-changed';
  expect(() => validateBindingPreflight(parsed, request, 'b'.repeat(64))).toThrow();
  parsed.pathPredicate.normalizedPaths.sourceRoot.normalized = request.sourceRoot;
  parsed.pathPredicate.selfcheck.rejected.driveRelative = false;
  expect(() => validateBindingPreflight(parsed, request, 'b'.repeat(64))).toThrow();
});
