import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  createDedicatedSimulatorArgs,
  dedicatedSimulatorCleanupArgs,
  selectDedicatedIphoneTemplate
} from './ios-dedicated-simulator.mjs';

export function createOwnedIosSimulator(options) {
  const template = selectDedicatedIphoneTemplate(options.listAvailable());
  const udid = options.create(createDedicatedSimulatorArgs(template, options.name)).trim();
  if (!udid) throw new Error('Dedicated iOS acceptance Simulator was not created.');
  writeFileSync(
    path.join(options.artifactDir, 'simulator-owned.json'),
    `${JSON.stringify({ template, udid }, null, 2)}\n`
  );
  return { template, udid };
}

export function cleanupOwnedIosSimulator(options) {
  const recorded = JSON.parse(readFileSync(path.join(options.artifactDir, 'simulator-owned.json'), 'utf8'));
  if (recorded.udid !== options.udid) {
    throw new Error('Dedicated Simulator identity does not match the recorded owned UDID.');
  }
  options.runAllowFailure(['simctl', 'terminate', options.udid, options.bundleId]);
  writeFileSync(path.join(options.artifactDir, 'simulator.log'), options.captureLog([
    'simctl', 'spawn', options.udid, 'log', 'show', '--last', '5m', '--style', 'compact',
    '--predicate', 'process == "App"'
  ]));
  const cleanup = dedicatedSimulatorCleanupArgs(options.udid);
  options.runAllowFailure(cleanup.shutdown);
  options.runAllowFailure(cleanup.delete);
}
