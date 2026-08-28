// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { allocateTwoDeviceAttempts } from './t152-two-device-matrix-orchestrator.mjs';
import { writeT152TwoDeviceCellReceipt } from './t152-two-device-cell-receipt.mjs';
import {
  TWO_DEVICE_CELLS, validateTwoDeviceMatrix
} from './t152-two-device-matrix-validator.mjs';

function receipt(root, cell, index) {
  const locators = [0, 1].map((side) => path.join(root, `${cell.id}-${side}.json`));
  locators.forEach((locator) => fs.writeFileSync(locator,
    `${JSON.stringify({ freshTaskResource: true })}\n`));
  const identities = [`${cell.id}-a`, `${cell.id}-b`];
  const run = (name, deviceIdentityKey, triggerReason) => ({ deviceIdentityKey,
    occurredAt: '2026-08-29T00:00:00.000Z', runId: `${cell.id}-${name}`,
    status: 'completed', triggerReason });
  return { attemptId: `attempt-${index}`,
    builds: Object.fromEntries([cell.creator, cell.joiner].map((host) => [host,
      ({ a5: 'd', fri: 'e', macos: 'b', windows: 'f' })[host].repeat(64)])),
    business: { idempotent: true, twoWayUnion: true }, cellId: cell.id,
    conflict: { silentOverwrite: false, visible: true }, creator: cell.creator,
    devices: [{ host: cell.creator, identity: identities[0] },
      { host: cell.joiner, identity: identities[1] }],
    failureLocator: locators[0], groupId: `group-${index}`,
    groupTag: index.toString(16).padStart(32, '0'), joiner: cell.joiner,
    legacyAbsence: Object.fromEntries([
      'group', 'member', 'manager', 'pairing', 'authorization', 'route', 'cursor', 'ack', 'nonce'
    ].map((key) => [key, { absent: true, resourceLocators: locators }])),
    libraries: locators.map((locator) => ({ locator })), preAccept: { groupKeyPresent: false },
    resourcesReleased: true, resultStatus: 'success', revision: 'a'.repeat(40),
    runs: { automaticAfterRestart: [
      run('automatic-after-a', identities[0], 'automatic'),
      run('automatic-after-b', identities[1], 'automatic')],
    automaticBeforeRestart: run('automatic-before', identities[0], 'automatic'),
    initial: run('initial', identities[1], 'initial'),
    manualAfterRestart: [run('manual-after-a', identities[0], 'manual'),
      run('manual-after-b', identities[1], 'manual')],
    manualBeforeRestart: [run('manual-before-a', identities[0], 'manual'),
      run('manual-before-b', identities[1], 'manual')] },
    schemaVersion: 1, tree: 'c'.repeat(40) };
}

it('preallocates six ordered, isolated attempts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-two-device-'));
  const manifest = allocateTwoDeviceAttempts(root, {
    revision: 'a'.repeat(40), tree: 'c'.repeat(40)
  });
  expect(manifest.cells.map(({ id }) => id)).toEqual(TWO_DEVICE_CELLS.map(({ id }) => id));
  expect(new Set(manifest.cells.map(({ attemptId }) => attemptId)).size).toBe(6);
  expect(fs.existsSync(path.join(root, 'attempts.json'))).toBe(true);
});

it('accepts only a complete same-revision six-cell matrix', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-two-device-'));
  const receipts = TWO_DEVICE_CELLS.map((cell, index) => receipt(root, cell, index));
  expect(validateTwoDeviceMatrix(receipts)).toHaveLength(6);
  receipts[4].preAccept.groupKeyPresent = true;
  expect(() => validateTwoDeviceMatrix(receipts)).toThrow('group key absence');
});

it('binds a terminal cell receipt to the preallocated environment', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-two-device-'));
  const cell = TWO_DEVICE_CELLS[0];
  const value = receipt(root, cell, 0);
  const receiptPath = path.join(root, 'bound', 'cell-receipt.json');
  const written = writeT152TwoDeviceCellReceipt(value, { env: {
    FOLIOLE_T152_CELL_ID: cell.id, FOLIOLE_T152_CELL_RECEIPT: receiptPath,
    FOLIOLE_T152_MATRIX_ATTEMPT: 'allocated-attempt',
    FOLIOLE_T152_MATRIX_REVISION: 'a'.repeat(40),
    FOLIOLE_T152_MATRIX_TREE: 'c'.repeat(40)
  } });
  expect(written.receipt.attemptId).toBe('allocated-attempt');
  expect(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).cellId).toBe(cell.id);
});

it('rejects a receipt whose participating host build changed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-two-device-'));
  const receipts = TWO_DEVICE_CELLS.map((cell, index) => receipt(root, cell, index));
  receipts[3].builds.windows = '1'.repeat(64);
  expect(() => validateTwoDeviceMatrix(receipts)).toThrow('windows builds differ');
});

it('keeps the formal path free of external discovery and product containers', () => {
  const files = [
    'scripts/acceptance/t152-two-device-matrix-orchestrator.mjs',
    'scripts/windows/macos-windows-single-principal-sync-group.mjs',
    'scripts/windows/macos-joins-windows-sync-group.mjs',
    'scripts/android/macos-a5-single-principal-sync-group-entry.mjs',
    'scripts/android/macos-a5-windows-two-device-entry.mjs',
    'scripts/ios/macos-fri-two-device-sync.mjs', 'scripts/ios/windows-fri-two-device-sync.mjs'
  ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const androidBuild = fs.readFileSync('scripts/android/a5-two-device-build.mjs', 'utf8');
  expect(files).not.toMatch(/bonjour-service|new Bonjour|\bdns-sd\b|com\.foliole\.ios['"]/u);
  expect(files).not.toMatch(/protectData\('backup'|deviceBackupRoot/u);
  expect(files).toContain('FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix');
  expect(files).toContain('friAcceptanceBundle(process.env.FOLIOLE_T152_MATRIX_ATTEMPT)');
  expect(androidBuild).toContain('FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID');
});
