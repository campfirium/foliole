import fs from 'node:fs';
import path from 'node:path';

import { captureA5SyncRun } from './a5-sync-event-proof.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

/* global clearTimeout, console, process, setTimeout */

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';
const PRODUCT_APP_ID = 'com.foliole.android';
const TEST_CLASS = `${PRODUCT_APP_ID}.FolioleCompanionSyncGroupJoinTest`;

function waitForControllerRelease(timeoutMs = 10 * 60_000) {
  return new Promise((resolve, reject) => {
    let input = '';
    const timeout = setTimeout(() => finish(new Error('A5 conflict release signal timed out.')),
      timeoutMs);
    const onData = (chunk) => {
      input += chunk;
      const line = input.split(/\r?\n/u)[0];
      if (line === 'consumer_complete') finish();
    };
    function finish(error) {
      clearTimeout(timeout); process.stdin.off('data', onData);
      if (error) reject(error); else resolve();
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
}

function validateJoin({ evidencePath, stdout }) {
  if (!/folioleSyncGroupJoinReceipt=.*"joined":true.*"restarted":true/u.test(stdout)
      || !/"prejoinFactText":"Multi-device sync B fact [^"]+"/u.test(stdout)
      || !/INSTRUMENTATION_CODE: -1/mu.test(stdout)) {
    throw Object.assign(new Error('A5 Device join and pre-existing fact evidence is incomplete.'), {
      evidenceRef: evidencePath, missingFact: 'a5_two_device_join_persistence'
    });
  }
}

async function observeJourneyFacts(args, buildIdentity, env, evidenceRoot, expectedJourneyCounts) {
  const result = await runMacosA5SyncGroupMaintenance({ action: 'observe-journey-facts',
    appId: ACCEPTANCE_APP_ID, buildIdentity, env, evidenceRoot,
    execute: args.execute, expectedJourneyCounts, installMain: false,
    paths: args.paths, serial: args.serial });
  return JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')).receipt;
}

export async function runMacosA5WindowsTwoDeviceEntry({ args, buildIdentity, env,
  evidenceRoot }) {
  args.markMutationBoundary?.();
  try {
    const joined = await runMacosA5InstrumentationMechanics({ appId: ACCEPTANCE_APP_ID,
      buildIdentity, env, evidenceRoot, execute: args.execute, paths: args.paths,
      expectedGroupId: process.env.FOLIOLE_T152_EXPECTED_GROUP_ID,
      expectedGroupTag: process.env.FOLIOLE_T152_EXPECTED_GROUP_TAG,
      serial: args.serial, testClass: TEST_CLASS,
      validateInstrumentation: (evidence) => validateJoin(evidence) });
    await runMacosA5SyncGroupMaintenance({ action: 'activate-participation',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-enabled'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    const a5Initial = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'initial-run') }, 'initial');
    await observeJourneyFacts(args, buildIdentity, env,
      path.join(evidenceRoot, 'initial-union'), { A: 2, B: 1 });
    const automatic = await runMacosA5SyncGroupMaintenance({ action: 'create-journey-fact',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-fact'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    const beforeRepeat = await observeJourneyFacts(args, buildIdentity, env,
      path.join(evidenceRoot, 'before-repeat'), { A: 2, B: 2 });
    const a5AutomaticBeforeRestart = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-run') }, 'automatic', [a5Initial.run]);
    await runMacosA5SyncGroupMaintenance({ action: 'pause-participation',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'a5-pause-for-conflict'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    await runMacosA5SyncGroupMaintenance({ action: 'fork-conflict',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'a5-conflict-fork'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    console.log('[macos-a5-dev] t152-conflict-fork-ready');
    await waitForControllerRelease();
    await runMacosA5SyncGroupMaintenance({ action: 'resume-participation',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'a5-resume-after-conflict'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    await runMacosA5SyncGroupMaintenance({ action: 'sync-now', appId: ACCEPTANCE_APP_ID,
      buildIdentity, env, evidenceRoot: path.join(evidenceRoot, 'manual-before-restart'),
      execute: args.execute, installMain: false, paths: args.paths, serial: args.serial });
    const a5ManualBeforeRestart = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'manual-before-restart-run') }, 'manual');
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', ACCEPTANCE_APP_ID]);
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W', '-n',
      `${ACCEPTANCE_APP_ID}/${PRODUCT_APP_ID}.MainActivity`]);
    const a5AutomaticAfterRestart = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-after-restart-run') }, 'automatic',
    [a5Initial.run, a5AutomaticBeforeRestart.run]);
    await runMacosA5SyncGroupMaintenance({ action: 'sync-now', appId: ACCEPTANCE_APP_ID,
      buildIdentity, env, evidenceRoot: path.join(evidenceRoot, 'manual-after-restart'),
      execute: args.execute, installMain: false, paths: args.paths, serial: args.serial });
    const a5ManualAfterRestart = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'manual-after-restart-run') }, 'manual',
    [a5ManualBeforeRestart.run]);
    const final = await observeJourneyFacts(args, buildIdentity, env,
      path.join(evidenceRoot, 'final-union'), { A: 2, B: 2 });
    if (JSON.stringify(final.facts.sort()) !== JSON.stringify(beforeRepeat.facts.sort())) {
      throw new Error('Repeated A5 sync was not idempotent.');
    }
    fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify({ buildIdentity,
      completedAt: new Date().toISOString(), instrumentation: joined.evidencePath,
      idempotent: true, journeyFacts: final, resultStatus: 'success',
      runs: { a5: { automaticAfterRestart: a5AutomaticAfterRestart.run,
        automaticBeforeRestart: a5AutomaticBeforeRestart.run, initial: a5Initial.run,
        manualAfterRestart: a5ManualAfterRestart.run,
        manualBeforeRestart: a5ManualBeforeRestart.run } },
      secondFactManifest: automatic.manifestPath
    }, null, 2)}\n`, 'utf8');
  } finally {
    args.checked(args.paths.adb, ['-s', args.serial, 'uninstall', ACCEPTANCE_APP_ID]);
  }
  console.log(`[macos-a5-dev] two-device-windows-provider evidence=${evidenceRoot}`);
}
