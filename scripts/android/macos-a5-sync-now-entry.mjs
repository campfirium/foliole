/* global console, process */

import path from 'node:path';

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';
import { MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';
import { assertMacosA5DailySyncRuntime } from './macos-a5-daily-sync-runtime.mjs';

export async function runMacosA5SyncNowEntry(args, dependencies = {}) {
  const assertDailyRuntime = dependencies.assertDailyRuntime ?? assertMacosA5DailySyncRuntime;
  const inspectBaseline = dependencies.inspectBaseline
    ?? (await import('./macos-a5-existing-sync-readiness-runner.mjs')).inspectExistingSyncDevice;
  const runAction = dependencies.runAction ?? runMacosA5SyncGroupMaintenance;
  args.assertFixed();
  await assertDailyRuntime(args.paths.sourceRepoRoot);
  await inspectBaseline({ adb: args.paths.adb,
    desktopDatabase: path.join(MACOS_DAILY_LIBRARY_HOME, 'Data', 'foliole.db') });
  args.build();
  await assertDailyRuntime(args.paths.sourceRepoRoot);
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(args.paths.artifactsRoot, 'a5-sync-now', buildIdentity);
  args.markMutationBoundary?.();
  const result = await runAction({
    action: 'sync-now', buildIdentity, env: args.env, evidenceRoot,
    execute: args.execute, paths: args.paths, serial: args.serial, transportRequired: false,
    instrumentationOwnsActivity: true
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] sync-now evidence=${result.manifestPath}`);
  return result;
}
