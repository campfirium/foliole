import fs from 'node:fs';

export const TWO_DEVICE_CELLS = Object.freeze([
  ['macos-windows', 'macos', 'windows'],
  ['windows-macos', 'windows', 'macos'],
  ['macos-a5', 'macos', 'a5'],
  ['windows-a5', 'windows', 'a5'],
  ['macos-fri', 'macos', 'fri'],
  ['windows-fri', 'windows', 'fri']
].map(([id, creator, joiner]) => Object.freeze({ creator, id, joiner })));

const LEGACY_STATE = Object.freeze([
  'group', 'member', 'manager', 'pairing', 'authorization', 'route', 'cursor', 'ack', 'nonce'
]);

function required(condition, message) {
  if (!condition) throw new Error(message);
}

function sha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40,64}$/u.test(value);
}

function completedRun(run, reason) {
  return typeof run?.deviceIdentityKey === 'string' && run.deviceIdentityKey.length > 0
    && typeof run.runId === 'string' && run.runId.length > 0
    && run.triggerReason === reason && (run.status === 'completed' || run.result === 'completed')
    && !Number.isNaN(Date.parse(run.occurredAt ?? run.startedAt ?? ''));
}

function deviceRunMap(runs) {
  return new Map(runs.map((run) => [run.deviceIdentityKey, run.runId]));
}

function validateBuilds(receipt, cell) {
  const expected = [cell.creator, cell.joiner].sort();
  required(receipt.builds && Object.keys(receipt.builds).sort().join(',') === expected.join(','),
    `${cell.id}: participating host builds are incomplete.`);
  required(expected.every((host) => sha(receipt.builds[host])),
    `${cell.id}: participating host build identity is invalid.`);
}

function validateFreshResources(receipt, cell) {
  const locators = receipt.libraries.map(({ locator }) => locator);
  for (const locator of locators) {
    let resource;
    try { resource = JSON.parse(fs.readFileSync(locator, 'utf8')); } catch { resource = null; }
    required(resource?.freshTaskResource === true,
      `${cell.id}: task resource freshness locator is invalid.`);
  }
  required(LEGACY_STATE.every((key) => receipt.legacyAbsence?.[key]?.absent === true
    && JSON.stringify(receipt.legacyAbsence[key].resourceLocators) === JSON.stringify(locators)),
  `${cell.id}: retired sync state absence is incomplete.`);
}

export function validateTwoDeviceCell(receipt, cell, { exists = fs.existsSync } = {}) {
  required(receipt?.schemaVersion === 1, `${cell.id}: unsupported receipt schema.`);
  required(receipt.resultStatus === 'success', `${cell.id}: receipt is not terminal success.`);
  required(receipt.cellId === cell.id && receipt.creator === cell.creator
    && receipt.joiner === cell.joiner, `${cell.id}: cell roles do not match.`);
  required(sha(receipt.revision) && sha(receipt.tree),
    `${cell.id}: frozen source identity is incomplete.`);
  validateBuilds(receipt, cell);
  required(typeof receipt.attemptId === 'string' && receipt.attemptId.length > 0,
    `${cell.id}: attempt identity is missing.`);
  required(typeof receipt.groupId === 'string' && receipt.groupId.length > 0,
    `${cell.id}: group identity is missing.`);
  required(/^[0-9a-f]{32}$/u.test(receipt.groupTag ?? ''),
    `${cell.id}: group tag is missing or invalid.`);
  required(Array.isArray(receipt.devices) && receipt.devices.length === 2
    && new Set(receipt.devices.map(({ identity }) => identity)).size === 2
    && new Set(receipt.devices.map(({ host }) => host)).size === 2,
  `${cell.id}: two distinct Device identities are required.`);
  required(receipt.libraries?.length === 2
    && receipt.libraries.every(({ locator }) => typeof locator === 'string' && exists(locator)),
  `${cell.id}: task-owned library/container locators are incomplete.`);
  validateFreshResources(receipt, cell);
  required(receipt.preAccept?.groupKeyPresent === false,
    `${cell.id}: pre-accept group key absence is unproved.`);
  const joinerIdentity = receipt.devices.find(({ host }) => host === cell.joiner)?.identity;
  required(completedRun(receipt.runs?.initial, 'initial')
    && receipt.runs.initial.deviceIdentityKey === joinerIdentity,
  `${cell.id}: initial run is not bound to the joining Device.`);
  required(completedRun(receipt.runs?.automaticBeforeRestart, 'automatic'),
    `${cell.id}: pre-restart automatic run is incomplete.`);
  required(Array.isArray(receipt.runs?.automaticAfterRestart)
    && receipt.runs.automaticAfterRestart.length === 2
    && receipt.runs.automaticAfterRestart.every((run) => completedRun(run, 'automatic'))
    && new Set(receipt.runs.automaticAfterRestart.map(({ deviceIdentityKey }) =>
      deviceIdentityKey)).size === 2,
  `${cell.id}: post-restart automatic runs are incomplete.`);
  const beforeByDevice = deviceRunMap([
    receipt.runs.initial, receipt.runs.automaticBeforeRestart,
    ...(receipt.runs.manualBeforeRestart ?? [])
  ]);
  required(receipt.runs.automaticAfterRestart.every((run) =>
    beforeByDevice.get(run.deviceIdentityKey) !== run.runId),
  `${cell.id}: restart did not produce new per-Device automatic runs.`);
  for (const name of ['manualBeforeRestart', 'manualAfterRestart']) {
    required(Array.isArray(receipt.runs?.[name]) && receipt.runs[name].length === 2
      && receipt.runs[name].every((run) => completedRun(run, 'manual'))
      && new Set(receipt.runs[name].map(({ deviceIdentityKey }) => deviceIdentityKey)).size === 2,
    `${cell.id}: ${name} is incomplete.`);
  }
  required(receipt.business?.twoWayUnion === true && receipt.business?.idempotent === true,
    `${cell.id}: two-way nonempty union or idempotence is unproved.`);
  required(receipt.conflict?.visible === true && receipt.conflict?.silentOverwrite === false,
    `${cell.id}: visible conflict is unproved.`);
  required(receipt.resourcesReleased === true, `${cell.id}: resources were not released.`);
  required(typeof receipt.failureLocator === 'string' && exists(receipt.failureLocator),
    `${cell.id}: persistent attempt locator is missing.`);
  return receipt;
}

export function validateTwoDeviceMatrix(receipts, options = {}) {
  required(Array.isArray(receipts) && receipts.length === TWO_DEVICE_CELLS.length,
    'Two-device matrix requires exactly six receipts.');
  const checked = TWO_DEVICE_CELLS.map((cell, index) =>
    validateTwoDeviceCell(receipts[index], cell, options));
  required(new Set(checked.map(({ revision }) => revision)).size === 1,
    'Two-device matrix revisions differ.');
  required(new Set(checked.map(({ tree }) => tree)).size === 1,
    'Two-device matrix trees differ.');
  for (const host of ['macos', 'windows', 'a5', 'fri']) {
    const builds = checked.flatMap((receipt) => receipt.builds[host] ?? []);
    required(new Set(builds).size === 1, `Two-device matrix ${host} builds differ.`);
  }
  required(new Set(checked.map(({ attemptId }) => attemptId)).size === checked.length,
    'Two-device matrix attempt identities are not unique.');
  required(new Set(checked.map(({ groupId, groupTag }) => `${groupId}:${groupTag}`)).size
    === checked.length,
    'Two-device matrix group identities are not unique.');
  const locators = checked.flatMap(({ libraries }) => libraries.map(({ locator }) => locator));
  required(new Set(locators).size === locators.length,
    'Two-device matrix task-owned libraries or containers were reused.');
  return checked;
}
