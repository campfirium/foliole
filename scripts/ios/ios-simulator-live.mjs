#!/usr/bin/env node
/* global console, process */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { companionBundledEnv, companionLiveReloadEnv, runCompanionLiveSession } from '../capacitor/companion-live-session.mjs';

import { createDedicatedSimulatorArgs, selectDedicatedIphoneTemplate } from './ios-dedicated-simulator.mjs';
import { prepareIosAcceptanceCache } from './ios-local-storage.mjs';

// A dedicated Simulator and the `.dev` bundle keep live reload away from any other installed Foliole.
export const IOS_LIVE_SIMULATOR_NAME = 'Foliole Live Reload';
export const IOS_LIVE_BUNDLE_SUFFIX = '.dev';
export const IOS_LIVE_BUNDLE_ID = `com.campfirium.foliole.ios${IOS_LIVE_BUNDLE_SUFFIX}`;

function checked(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed with exit ${result.status}`);
}

function captured(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `${path.basename(command)} failed`);
  return result.stdout.trim();
}

export function findIosLiveSimulator(devicePayload) {
  return Object.values(devicePayload.devices ?? {}).flat()
    .find((device) => device.isAvailable && device.name === IOS_LIVE_SIMULATOR_NAME) ?? null;
}

export function createIosLiveBuildArgs({ derivedData, repoRoot, udid }) {
  return [
    '-project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '-scheme', 'App', '-configuration', 'Debug',
    '-destination', `platform=iOS Simulator,id=${udid}`, '-derivedDataPath', derivedData,
    '-packageCachePath', path.join(derivedData, 'PackageCache'),
    `FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX=${IOS_LIVE_BUNDLE_SUFFIX}`, 'build'
  ];
}

export function iosLiveAppPath(derivedData) {
  return path.join(derivedData, 'Build/Products/Debug-iphonesimulator/App.app');
}

function ensureLiveSimulator(capture, run) {
  const devices = JSON.parse(capture('xcrun', ['simctl', 'list', 'devices', 'available', '-j']));
  const udid = findIosLiveSimulator(devices)?.udid
    ?? capture('xcrun', createDedicatedSimulatorArgs(selectDedicatedIphoneTemplate(devices), IOS_LIVE_SIMULATOR_NAME));
  run('xcrun', ['simctl', 'bootstatus', udid, '-b']);
  // Showing the window is a convenience; the session works headless as well.
  try { run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]); }
  catch { console.log(`[ios-live] open the Simulator app to watch "${IOS_LIVE_SIMULATOR_NAME}".`); }
  return udid;
}

export async function runIosSimulatorLive({
  capture = captured, env = process.env, repoRoot = process.cwd(), run = checked, session = runCompanionLiveSession
} = {}) {
  const udid = ensureLiveSimulator(capture, run);
  const cap = path.join(repoRoot, 'node_modules/.bin/cap');
  run('npm', ['run', 'android:web:build'], { cwd: repoRoot, env });
  run(cap, ['sync', 'ios'], { cwd: repoRoot, env: companionLiveReloadEnv(env) });
  const { derivedData } = prepareIosAcceptanceCache(repoRoot);
  run('xcodebuild', createIosLiveBuildArgs({ derivedData, repoRoot, udid }), { cwd: repoRoot, env });
  await session({
    root: repoRoot,
    start: () => {
      run('xcrun', ['simctl', 'install', udid, iosLiveAppPath(derivedData)]);
      run('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, IOS_LIVE_BUNDLE_ID]);
    },
    restore: () => {
      run(cap, ['sync', 'ios'], { cwd: repoRoot, env: companionBundledEnv(env) });
      console.log(`[ios-live] stopped; ${IOS_LIVE_BUNDLE_ID} on "${IOS_LIVE_SIMULATOR_NAME}" still loads from this Mac.`);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runIosSimulatorLive();
}
