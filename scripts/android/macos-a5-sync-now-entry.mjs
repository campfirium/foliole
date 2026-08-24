/* global console, process */

import path from 'node:path';

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';
import { buildMacosA5Desktop } from './macos-a5-extended-actions.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';

export async function runMacosA5SyncNowEntry(args, dependencies = {}) {
  const buildDesktop = dependencies.buildDesktop ?? buildMacosA5Desktop;
  const openDesktopSession = dependencies.openDesktopSession ?? openMacosPairSyncDesktopSession;
  const runAction = dependencies.runAction ?? runMacosA5SyncGroupMaintenance;
  args.assertFixed();
  args.build();
  buildDesktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(args.paths.artifactsRoot, 'a5-sync-now', buildIdentity);
  args.markMutationBoundary?.();
  const session = await openDesktopSession({
    env: args.env,
    libraryHome: args.paths.desktopDevLibrary,
    repoRoot: args.paths.buildRoot,
    runtimeRoot: args.paths.desktopRuntimeRoot
  });
  try {
    session.assertActive();
    const result = await runAction({
      action: 'sync-now', buildIdentity, env: args.env, evidenceRoot,
      execute: args.execute, paths: args.paths, serial: args.serial
    });
    process.stdout.write(result.output);
    console.log(`[macos-a5-dev] sync-now evidence=${result.manifestPath}`);
    return result;
  } finally {
    await session.close();
  }
}
