/* global setTimeout */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

export function selectSimulator(devicePayload) {
  const candidates = Object.entries(devicePayload.devices ?? {})
    .filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, devices]) => devices)
    .filter((device) => device.isAvailable && /^iPhone /.test(device.name));
  candidates.sort((left, right) => Number(right.state === 'Booted') - Number(left.state === 'Booted'));
  if (!candidates[0]) throw new Error('Could not find an available iPhone simulator.');
  return candidates[0];
}

export function shouldShutdownSimulator(simulator) {
  return simulator.state !== 'Booted';
}

export function parseBootstrapSnapshot(output) {
  const [deviceId, tableCount] = output.trim().split('\n');
  return { deviceId: deviceId?.trim() ?? '', tableCount: Number(tableCount) };
}

export function createSimulatorAcceptanceBuildArgs(options) {
  return [
    '-project', path.join(options.repoRoot, 'ios/App/App.xcodeproj'),
    '-scheme', 'App', '-configuration', 'Debug',
    '-destination', `platform=iOS Simulator,id=${options.udid}`,
    '-derivedDataPath', options.derivedData,
    ...options.resourceArgs,
    `PRODUCT_BUNDLE_IDENTIFIER=${options.bundleId}`,
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS=$(inherited) FOLIOLE_IOS_BRIDGE_ACCEPTANCE',
    'build'
  ];
}

export async function waitForAcceptanceObservation(options) {
  options.action?.();
  const deadline = Date.now() + (options.timeoutMs ?? 15000);
  let lastObservation = options.initialObservation;
  while (Date.now() <= deadline) {
    try {
      const value = options.read();
      if (options.accept(value)) return value;
      lastObservation = options.describe(value);
    } catch (error) {
      lastObservation = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 100));
  }
  throw new Error(`Timed out waiting for ${options.label}: ${lastObservation}`);
}

export function waitForBootstrapSnapshot(readSnapshot, action, timeoutMs = 15000, intervalMs = 100) {
  return waitForAcceptanceObservation({
    accept: (snapshot) => Boolean(snapshot.deviceId) && snapshot.tableCount === 3,
    action,
    describe: (snapshot) => `device identity present=${Boolean(snapshot.deviceId)}, required tables=${snapshot.tableCount}`,
    initialObservation: 'bootstrap database was not readable',
    intervalMs,
    label: 'iOS bootstrap readiness',
    read: readSnapshot,
    timeoutMs
  });
}

export function writeAcceptanceFailure(artifactDir, error) {
  const failure = {
    error: error instanceof Error ? error.message : String(error),
    status: 'failed'
  };
  writeFileSync(path.join(artifactDir, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`);
}

export function verifyBridgeResult(result, expectedScenario = 'pairing-signed-transport') {
  if (result?.status !== 'passed') throw new Error(result?.error || 'The WebView bridge scenario failed.');
  if (result.scenario !== expectedScenario) throw new Error('The WebView bridge scenario was unexpected.');
  return result;
}
