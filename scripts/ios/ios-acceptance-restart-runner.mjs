import { readFileSync } from 'node:fs';

import {
  verifyBridgeResult,
  waitForAcceptanceObservation,
  waitForBootstrapSnapshot
} from './ios-simulator-acceptance-runner.mjs';
import { runSyncPackRejections } from './ios-sync-pack-acceptance-runner.mjs';

const DEFAULT_BRIDGE_RESULT_TIMEOUT_MS = 15_000;
const SYNC_PACK_BRIDGE_RESULT_TIMEOUT_MS = 60_000;

export function restartBridgeResultTimeoutMs(scenario) {
  return scenario === 'sync-pack-runtime' ? SYNC_PACK_BRIDGE_RESULT_TIMEOUT_MS : DEFAULT_BRIDGE_RESULT_TIMEOUT_MS;
}

export async function runAcceptanceRestart(options) {
  const second = await waitForBootstrapSnapshot(options.readBootstrap, options.launch, options.bootstrapTimeoutMs);
  const secondBridge = verifyBridgeResult(await readBridgeResult(options), options.scenario);
  options.terminate();
  const syncPackRejections = options.scenario === 'sync-pack-runtime'
    ? await runSyncPackRejections({
      ...options,
      launchAndReadBridge: async () => {
        options.launch();
        return verifyBridgeResult(await readBridgeResult(options), options.scenario);
      }
    })
    : [];
  return { second, secondBridge, syncPackRejections };
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
