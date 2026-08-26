/* global console, process */

import path from 'node:path';

import {
  runMacosA5InstrumentationMechanics
} from './macos-a5-sync-group-maintenance-action.mjs';

const APP_ID = 'com.foliole.android';
const TEST_CLASS = `${APP_ID}.FolioleCompanionJoinRequestProviderTest`;

function validateProviderAcceptance({ evidencePath, stdout }) {
  if (!/OK \(2 tests\)/u.test(stdout)) {
    throw Object.assign(new Error('A5 join request provider test did not pass.'), {
      evidenceRef: evidencePath, missingFact: 'join_request_provider_passed'
    });
  }
}

export async function runMacosA5SyncGroupJoinPrepareEntry(args, dependencies = {}) {
  const mechanics = dependencies.mechanics ?? runMacosA5InstrumentationMechanics;
  args.assertFixed();
  args.build();
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(
    args.paths.artifactsRoot, 'a5-sync-group-join-prepare', buildIdentity
  );
  const backupRoot = path.join(args.paths.deviceBackupRoot, buildIdentity);
  args.markMutationBoundary?.();
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', APP_ID]);
  await args.protectData('backup', path.join(evidenceRoot, 'baseline.json'), backupRoot);
  const result = await mechanics({
    buildIdentity, env: args.env, evidenceRoot, execute: args.execute,
    paths: args.paths, serial: args.serial, testClass: TEST_CLASS,
    validateInstrumentation: validateProviderAcceptance
  });
  process.stdout.write(result.output);
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', APP_ID]);
  await args.protectData('check', path.join(evidenceRoot, 'baseline.json'), backupRoot);
  args.checked(args.paths.adb, [
    '-s', args.serial, 'shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`
  ]);
  console.log(`[macos-a5-dev] sync-group-join-prepare evidence=${result.evidencePath}`);
  return result;
}
