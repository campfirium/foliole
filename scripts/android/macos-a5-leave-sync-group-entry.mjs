/* global console */

import path from 'node:path';

import { buildMacosA5Desktop } from './macos-a5-extended-actions.mjs';
import {
  assertJoinedEmptyCredentialReauthorization,
  collectCredentialProtectedReadiness,
  leaveJoinedEmptyCredentialSession
} from './macos-a5-pair-credentials-rejoin.mjs';
import { resolveMacosA5PairSyncReadiness } from './macos-a5-product-bootstrap.mjs';

export async function runMacosA5LeaveSyncGroupEntry(args, dependencies = {}) {
  const assertJoinedEmpty = dependencies.assertJoinedEmpty
    ?? assertJoinedEmptyCredentialReauthorization;
  const buildDesktop = dependencies.buildDesktop ?? buildMacosA5Desktop;
  const collectReadiness = dependencies.collectReadiness ?? collectCredentialProtectedReadiness;
  const leaveJoinedEmpty = dependencies.leaveJoinedEmpty ?? leaveJoinedEmptyCredentialSession;
  const resolveReadiness = dependencies.resolveReadiness ?? resolveMacosA5PairSyncReadiness;
  args.assertFixed();
  const readiness = resolveReadiness(args.paths);
  args.build();
  buildDesktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(
    args.paths.artifactsRoot, 'a5-sync-group-maintenance', buildIdentity
  );
  args.markMutationBoundary?.();
  const protectedReadiness = await collectReadiness(readiness, {
    env: args.env, execute: args.execute, paths: args.paths, serial: args.serial
  });
  const baseline = assertJoinedEmpty(protectedReadiness);
  args.checked(args.paths.adb, ['-s', args.serial, 'install', '-r', args.paths.apk]);
  const result = await leaveJoinedEmpty({ baseline, buildIdentity, env: args.env,
    evidenceRoot, execute: args.execute, paths: args.paths, serial: args.serial });
  console.log(`[macos-a5-dev] leave-sync-group evidence=${result.manifestPath}`);
  return result;
}
