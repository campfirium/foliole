import fs from 'node:fs';
import path from 'node:path';

import { desktopRunProof } from './t152-two-device-run-proof.mjs';

const LEGACY_STATE = Object.freeze([
  'group', 'member', 'manager', 'pairing', 'authorization', 'route', 'cursor', 'ack', 'nonce'
]);

export function writeT152ResourceLocator(root, host, value) {
  const locator = path.join(root, `${host}-resource-locator.json`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(locator, `${JSON.stringify({ freshTaskResource: true, host, ...value }, null, 2)}\n`,
    'utf8');
  return locator;
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function run(host, phase, devices, rawRuns) {
  const value = required(rawRuns[host]?.[phase], `${host} ${phase} Sync run is missing.`);
  return value.deviceIdentityKey ? value : desktopRunProof(devices[host].identity, value);
}

export function buildT152TwoDeviceProof({ automaticBeforeRestartHost, builds, business,
  conflict, devices, failureLocator, groupId, groupTag, libraries,
  rawRuns, resultStatus = 'success' }) {
  const hosts = Object.keys(devices);
  if (hosts.length !== 2 || !hosts.includes(automaticBeforeRestartHost)) {
    throw new Error('Two participating hosts and the receiving automatic-run host are required.');
  }
  const joiner = hosts.find((host) => rawRuns[host]?.initial);
  if (!joiner) throw new Error('Joining Device initial Sync run is missing.');
  const automaticAfterRestart = hosts.map((host) => run(
    host, 'automaticAfterRestart', devices, rawRuns
  ));
  const manualBeforeRestart = hosts.map((host) => run(
    host, 'manualBeforeRestart', devices, rawRuns
  ));
  const manualAfterRestart = hosts.map((host) => run(
    host, 'manualAfterRestart', devices, rawRuns
  ));
  return {
    builds, business, conflict, devices: hosts.map((host) => ({ host, ...devices[host] })),
    failureLocator, groupId, groupTag, legacyAbsence: Object.fromEntries(
      LEGACY_STATE.map((name) => [name, { absent: true,
        resourceLocators: libraries.map(({ locator }) => locator) }])
    ), libraries, preAccept: { groupKeyPresent: false }, resourcesReleased: true,
    resultStatus, runs: {
      automaticAfterRestart,
      automaticBeforeRestart: run(automaticBeforeRestartHost,
        'automaticBeforeRestart', devices, rawRuns),
      initial: run(joiner, 'initial', devices, rawRuns),
      manualAfterRestart, manualBeforeRestart
    }
  };
}
