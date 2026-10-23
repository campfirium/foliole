import { readFileSync } from 'node:fs';

import {
  verifyBridgeResult,
  waitForAcceptanceObservation,
  waitForBootstrapSnapshot
} from './ios-simulator-acceptance-runner.mjs';

const DEFAULT_BRIDGE_RESULT_TIMEOUT_MS = 15_000;
const SYNC_PACK_BRIDGE_RESULT_TIMEOUT_MS = 60_000;
const LIVE_PACK_SCENARIOS = new Set([
  'content-resource-read', 'state-writeback-runtime', 'sync-pack-runtime'
]);

export function restartBridgeResultTimeoutMs(scenario) {
  return LIVE_PACK_SCENARIOS.has(scenario) ? SYNC_PACK_BRIDGE_RESULT_TIMEOUT_MS : DEFAULT_BRIDGE_RESULT_TIMEOUT_MS;
}

/**
 * The SQLite plugin opens the database without a busy handler, so a host sqlite3 read racing
 * the app's open (its last-connection checkpoint holds an exclusive lock) fails the launch.
 * The host reads the database only after the launch published its bridge result.
 */
export async function launchAndReadAfterBridge(options) {
  options.launch();
  const bridge = verifyBridgeResult(await readBridgeResult(options), options.scenario);
  const snapshot = await waitForBootstrapSnapshot(options.readBootstrap, undefined, options.bootstrapTimeoutMs);
  return { bridge, snapshot };
}

export async function runAcceptanceRestart(options) {
  const { bridge: secondBridge, snapshot: second } = await launchAndReadAfterBridge(options);
  options.terminate();
  return { second, secondBridge, syncPackRejections: [] };
}

function readBridgeResult(options) {
  if (options.readBridgeResult) return options.readBridgeResult();
  return waitForAcceptanceObservation({
    accept: (result) => result?.status === 'passed' || result?.status === 'failed',
    describe: (result) => `scenario status=${result?.status ?? 'missing'}`,
    initialObservation: 'restart bridge result was not readable',
    label: 'iOS acceptance restart result',
    read: () => JSON.parse(readFileSync(options.bridgeResultPath, 'utf8')),
    timeoutMs: restartBridgeResultTimeoutMs(options.scenario)
  });
}
