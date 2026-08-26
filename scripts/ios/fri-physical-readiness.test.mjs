import { expect, it } from 'vitest';

import {
  createFriPhysicalReadinessAdapter, FRI_COREDEVICE_ID, FRI_UDID, runFriControlPlaneProbe
} from './fri-physical-readiness.mjs';

it('requires the fixed wired physical Fri destination', async () => {
  const calls = [];
  const execute = async (command, args) => {
    calls.push([command, args]);
    if (args.includes('details')) return [
      'name: Fri', 'deviceType: iPhone', 'pairingState: paired',
      'developerModeStatus: enabled', 'transportType: wired'
    ].join('\n');
    if (args.includes('lockState')) return 'unlockedSinceBoot: true\n';
    return `Fri (${FRI_UDID})`;
  };
  await expect(createFriPhysicalReadinessAdapter({ execute })()).resolves.toMatchObject({
    facts: expect.arrayContaining(['fri_wired', 'fri_xcode_destination_ready'])
  });
  expect(calls.every(([, args]) => !args.some((arg) => /Simulator/u.test(arg)))).toBe(true);
  expect(calls[0][1]).toContain(FRI_COREDEVICE_ID);
});

it('rejects a wireless Fri before XCUITest', async () => {
  const execute = async () => [
    'name: Fri', 'deviceType: iPhone', 'pairingState: paired',
    'developerModeStatus: enabled', 'transportType: network'
  ].join('\n');
  await expect(createFriPhysicalReadinessAdapter({ execute })()).rejects.toMatchObject({
    missingFact: 'fri_not_wired'
  });
});

it('runs the isolated physical XCUITest control-plane probe', async () => {
  const calls = [];
  const execute = async (...args) => { calls.push(args); return 'passed'; };
  await expect(runFriControlPlaneProbe({ artifactRoot: '/evidence', execute })).resolves
    .toMatchObject({ facts: ['fri_xcuitest_control_plane_ready'] });
  expect(calls[0][1]).toEqual(expect.arrayContaining([
    '--scheme', 'FriXCUITestProbe', '--artifacts-dir', '/evidence'
  ]));
});
