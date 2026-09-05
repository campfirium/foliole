#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { runFriSyncGroupProvider } from './fri-sync-group-provider.mjs';
import { writeFriTwoDeviceCellReceipt } from './fri-two-device-cell-receipt.mjs';
import { buildFriRunTimeline } from './fri-two-device-run-proof.mjs';
import {
  friAcceptanceBundle, runFriGroupIdentityPreflight, runFriSyncEventProjection
} from './ios-acceptance-sync-event-projection.mjs';

const FRI_RUNNER = '/Users/roamer/.codex/skills/ios-physical-acceptance/scripts/run-fri-xcuitest.sh';

function stateSignals() {
  const waiting = new Map();
  const values = new Map();
  const waitFor = (status) => values.has(status) ? Promise.resolve(values.get(status))
    : new Promise((resolve) => waiting.set(status, resolve));
  const publish = (value) => {
    values.set(value.resultStatus, value);
    waiting.get(value.resultStatus)?.(value);
    waiting.delete(value.resultStatus);
  };
  return { publish, waitFor };
}

export async function runMacosFriTwoDeviceSync({ acceptedTip, evidenceRoot,
  repoRoot = process.cwd() }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const bundle = friAcceptanceBundle(process.env.FOLIOLE_T152_MATRIX_ATTEMPT);
  const providerRoot = path.join(evidenceRoot, 'macos-provider');
  const signals = stateSignals();
  let releaseProvider;
  const provider = runFriSyncGroupProvider({ acceptanceRoot: path.join(evidenceRoot, 'shared'),
    evidenceRoot: providerRoot, repoRoot, twoDevice: true,
    onState: signals.publish,
    waitForRelease: () => new Promise((resolve) => { releaseProvider = resolve; }) });
  const ready = await signals.waitFor('ready');
  const friRoot = path.join(evidenceRoot, 'fri-xcuitest');
  const execute = createActionExecutor({ logPath: path.join(evidenceRoot, 'fri-xcuitest.log'),
    progressPath: path.join(evidenceRoot, 'fri-xcuitest-progress.jsonl') });
  let fri;
  let conflictReleaseStarted = false;
  let conflictRelease = Promise.resolve();
  try {
    await runFriGroupIdentityPreflight({ evidenceRoot: path.join(evidenceRoot, 'fri-identity'),
      execute, groupId: ready.groupId, groupTag: ready.groupTag, repoRoot, bundle });
    fri = await execute('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'join'),
      '--keep-app-foreground', bundle.applicationId,
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch'
    ], { action: 'fri-two-device', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix,
      FOLIOLE_T152_EXPECTED_GROUP_ID: ready.groupId,
      FOLIOLE_T152_EXPECTED_GROUP_TAG: ready.groupTag, FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 60 * 60_000, host: 'ios-b', stage: 'macos-fri-two-device' });
    if (fri.code !== 0) throw new Error('Fri physical two-Device XCUITest failed.');
    await signals.waitFor('conflict-fork-ready');
    const conflictStage = await execute('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'conflict'),
      '--keep-app-foreground', bundle.applicationId,
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testCompletesTwoDeviceConflictAndRestart'
    ], { action: 'fri-two-device-conflict', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix, FOLIOLE_T152_TWO_DEVICE: '1' },
    onOutput: ({ stdout }) => {
      if (conflictReleaseStarted || !stdout.includes('[foliole-fri] t152-conflict-fork-ready')) return;
      conflictReleaseStarted = true;
      conflictRelease = Promise.resolve(releaseProvider?.('consumer_complete'));
    }, hardDeadlineMs: 45 * 60_000, host: 'ios-b', stage: 'macos-fri-conflict' });
    if (conflictStage.code !== 0) throw new Error('Fri conflict/restart XCUITest failed.');
    await conflictRelease;
    await signals.waitFor('automatic-converged');
    fri = { ...fri, syncEvents: await runFriSyncEventProjection({ buildIdentity: acceptedTip,
      evidenceRoot: path.join(evidenceRoot, 'fri-sync-events'), execute, repoRoot, bundle }) };
  } finally {
    releaseProvider?.('consumer_complete');
    fri = { ...fri, provider: await provider };
  }
  const friTimeline = buildFriRunTimeline(fri.syncEvents.value, bundle.applicationId);
  const receipt = { acceptedTip, completedAt: new Date().toISOString(), friRoot,
    groupId: fri.provider.receipt.groupId, groupTag: fri.provider.receipt.groupTag,
    syncEventProjection: fri.syncEvents.file,
    acceptanceApplicationId: bundle.applicationId, runs: {
      fri: friTimeline.runs, macos: fri.provider.receipt.runs
    },
    resultStatus: 'success', schemaVersion: 1 };
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (process.env.FOLIOLE_T152_CELL_ID) {
    writeFriTwoDeviceCellReceipt({ applicationId: bundle.applicationId,
      buildIdentity: acceptedTip, evidenceRoot, providerHost: 'macos',
      providerLibrary: fri.provider.receipt.libraryLocator,
      input: { automaticBeforeRestartHost: 'fri',
        business: { idempotent: true, twoWayUnion: true },
        conflict: fri.provider.receipt.conflict,
        devices: { fri: { identity: friTimeline.identity },
          macos: { identity: fri.provider.receipt.localDeviceIdentityKey } },
        failureLocator: evidenceRoot, groupId: receipt.groupId, groupTag: receipt.groupTag,
        rawRuns: receipt.runs } });
  }
  return { receipt, receiptPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const acceptedTip = process.argv[2];
  const evidenceRoot = process.argv[3];
  if (!/^[0-9a-f]{40}$/u.test(acceptedTip ?? '') || !evidenceRoot) {
    throw new Error('usage: macos-fri-two-device-sync <accepted-tip> <evidence-root>');
  }
  const result = await runMacosFriTwoDeviceSync({ acceptedTip,
    evidenceRoot: path.resolve(evidenceRoot) });
  console.log(`[macos-fri-two-device-sync] status=success receipt=${result.receiptPath}`);
}
