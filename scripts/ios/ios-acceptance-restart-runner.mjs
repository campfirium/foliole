import { readFileSync } from 'node:fs';

import {
  verifyBridgeResult,
  waitForAcceptanceObservation,
  waitForBootstrapSnapshot
} from './ios-simulator-acceptance-runner.mjs';
import { runSyncPackRejections } from './ios-sync-pack-acceptance-runner.mjs';

export async function runAcceptanceRestart(options) {
  const second = await waitForBootstrapSnapshot(options.readBootstrap, options.launch);
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
  return waitForAcceptanceObservation({
    accept: (result) => result?.status === 'passed' || result?.status === 'failed',
    describe: (result) => `scenario status=${result?.status ?? 'missing'}`,
    initialObservation: 'restart bridge result was not readable',
    label: 'iOS acceptance restart result',
    read: () => JSON.parse(readFileSync(options.bridgeResultPath, 'utf8'))
  });
}
