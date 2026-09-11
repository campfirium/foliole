import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  createFriPhysicalReadinessAdapter, FRI_COREDEVICE_ID, FRI_UDID,
  prepareFriControlPlaneProbe, runFriControlPlaneProbe
} from './fri-physical-readiness.mjs';

it('requires the fixed wired physical Fri destination', async () => {
  const calls = [];
  const execute = async (command, args) => {
    calls.push([command, args]);
    if (args.includes('details')) return [
      'name: Fri', 'deviceType: iPhone', 'pairingState: paired',
      'developerModeStatus: enabled', 'transportType: wired'
    ].join('\n');
    if (args.includes('lockState')) return 'passcodeRequired: false\nunlockedSinceBoot: true\n';
    return `Fri (${FRI_UDID})`;
  };
  await expect(createFriPhysicalReadinessAdapter({ execute })()).resolves.toMatchObject({
    facts: expect.arrayContaining(['fri_wired', 'fri_xcode_destination_ready'])
  });
  expect(calls.every(([, args]) => !args.some((arg) => /Simulator/u.test(arg)))).toBe(true);
  expect(calls[0][1]).toContain(FRI_COREDEVICE_ID);
});

it('rejects Fri when it was unlocked since boot but is currently locked', async () => {
  const execute = async (_command, args) => {
    if (args.includes('details')) return [
      'name: Fri', 'deviceType: iPhone', 'pairingState: paired',
      'developerModeStatus: enabled', 'transportType: wired'
    ].join('\n');
    if (args.includes('lockState')) return 'passcodeRequired: true\nunlockedSinceBoot: true\n';
    return `Fri (${FRI_UDID})`;
  };
  await expect(createFriPhysicalReadinessAdapter({ execute })()).rejects.toMatchObject({
    missingFact: 'fri_current_unlock_required'
  });
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
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-readiness-'));
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-cache-'));
  fs.writeFileSync(path.join(cacheRoot, 'prepared.json'), '{}\n');
  await expect(runFriControlPlaneProbe({ artifactRoot, cacheRoot, execute })).resolves
    .toMatchObject({ facts: [
      'fri_xcuitest_control_plane_ready', 'fri_idle_timer_guard_foreground'
    ], status: 'passed' });
  expect(calls[0][0]).toBe('xcodebuild');
  expect(calls[0][1][0]).toBe('test-without-building');
  expect(calls[0][1]).toEqual(expect.arrayContaining([
    '-scheme', 'FriXCUITestProbe', '-destination', `platform=iOS,id=${FRI_UDID}`,
    '-destination-timeout', '5'
  ]));
  expect(calls[0][1].some((arg) => /Simulator/u.test(arg))).toBe(false);
  expect(calls[0][2].timeout).toBe(120_000);
  expect(calls[1][0]).toBe('xcrun');
  expect(calls[1][1]).toEqual([
    'devicectl', 'device', 'process', 'launch', '--device', FRI_COREDEVICE_ID,
    '--terminate-existing', '--timeout', '30', 'com.chenyaopeng.FriXCUITestProbe'
  ]);
  expect(calls[1][2].timeout).toBe(40_000);
});

it('records the current Fri lock as a control-plane blocker', async () => {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-readiness-'));
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-cache-'));
  fs.writeFileSync(path.join(cacheRoot, 'prepared.json'), '{}\n');
  const logPath = path.join(artifactRoot, 'fri-control-plane.log');
  const execute = async () => { throw Object.assign(new Error('probe failed'), {
    stderr: 'Xcode cannot launch tests. Unlock Fri to Continue\n'
  }); };
  await expect(runFriControlPlaneProbe({ artifactRoot, cacheRoot, execute })).resolves.toMatchObject({
    evidencePath: logPath, missingFact: 'fri_current_unlock_required', status: 'blocked'
  });
});

it('prepares the physical control plane outside the readiness probe', async () => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-cache-'));
  const calls = [];
  const execute = async (...args) => { calls.push(args); return 'built'; };
  await expect(prepareFriControlPlaneProbe({ cacheRoot, execute })).resolves
    .toMatchObject({ status: 'prepared' });
  expect(calls[0][1][0]).toBe('build-for-testing');
  expect(fs.existsSync(path.join(cacheRoot, 'prepared.json'))).toBe(true);
});
