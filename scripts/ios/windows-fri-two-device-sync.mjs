#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';
import {
  friAcceptanceBundle, runFriGroupIdentityPreflight, runFriSyncEventProjection
} from './ios-acceptance-sync-event-projection.mjs';
import { writeFriTwoDeviceCellReceipt } from './fri-two-device-cell-receipt.mjs';
import { buildFriRunTimeline } from './fri-two-device-run-proof.mjs';

const FRI_RUNNER = '/Users/roamer/.codex/skills/ios-physical-acceptance/scripts/run-fri-xcuitest.sh';

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function executor(root, name) {
  return createActionExecutor({ logPath: path.join(root, `${name}.log`),
    progressPath: path.join(root, `${name}-progress.jsonl`) });
}

export async function runWindowsFriTwoDeviceSync({ acceptedTip, evidenceRoot,
  repoRoot = process.cwd() }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const bundle = friAcceptanceBundle(process.env.FOLIOLE_T152_MATRIX_ATTEMPT);
  const provider = startWindowsSyncGroupProvider({ action: 'two-device-sync-provider',
    execute: executor(evidenceRoot, 'windows-provider'), repoRoot });
  let providerSettled = false;
  try {
    await provider.waitForProgress('provider-ready');
    const providerIdentity = await provider.waitForGroupIdentity();
    const friRoot = path.join(evidenceRoot, 'fri-xcuitest');
    await runFriGroupIdentityPreflight({ evidenceRoot: path.join(evidenceRoot, 'fri-identity'),
      execute: executor(evidenceRoot, 'fri-identity'), ...providerIdentity, repoRoot, bundle });
    let conflictReleaseStarted = false;
    let conflictRelease = Promise.resolve();
    const fri = await executor(evidenceRoot, 'fri-xcuitest')('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'join'),
      '--keep-app-foreground', bundle.applicationId,
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch'
    ], { action: 'fri-two-device', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix,
      FOLIOLE_T152_EXPECTED_GROUP_ID: providerIdentity.groupId,
      FOLIOLE_T152_EXPECTED_GROUP_TAG: providerIdentity.groupTag,
      FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 60 * 60_000, host: 'ios-b', stage: 'windows-fri-two-device' });
    if (fri.code !== 0) throw new Error('Fri physical two-Device XCUITest failed.');
    await provider.waitForProgress('conflict-fork-ready');
    const conflictStage = await executor(evidenceRoot, 'fri-conflict')('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'conflict'),
      '--keep-app-foreground', bundle.applicationId,
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testCompletesTwoDeviceConflictAndRestart'
    ], { action: 'fri-two-device-conflict', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix, FOLIOLE_T152_TWO_DEVICE: '1' },
    onOutput: ({ stdout }) => {
      if (conflictReleaseStarted || !stdout.includes('[foliole-fri] t152-conflict-fork-ready')) return;
      conflictReleaseStarted = true;
      conflictRelease = provider.release('consumer_complete');
    }, hardDeadlineMs: 45 * 60_000, host: 'ios-b', stage: 'windows-fri-conflict' });
    if (conflictStage.code !== 0) throw new Error('Fri conflict/restart XCUITest failed.');
    await conflictRelease;
    const syncEvents = await runFriSyncEventProjection({ buildIdentity: acceptedTip,
      evidenceRoot: path.join(evidenceRoot, 'fri-sync-events'),
      execute: executor(evidenceRoot, 'fri-sync-events'), repoRoot, bundle });
    await provider.waitForProgress('automatic-converged');
    const windows = await provider.finish(); providerSettled = true;
    const friTimeline = buildFriRunTimeline(syncEvents.value, bundle.applicationId);
    const receipt = { acceptedTip, completedAt: new Date().toISOString(), friRoot,
      resultStatus: 'success', schemaVersion: 1,
      acceptanceApplicationId: bundle.applicationId,
      groupId: providerIdentity.groupId, groupTag: providerIdentity.groupTag,
      syncEventProjection: syncEvents.file, runs: {
        fri: friTimeline.runs, windows: windows.receipt.runs
      },
      windowsEvidenceRoot: path.dirname(windows.evidenceRef) };
    const receiptPath = path.join(evidenceRoot, 'receipt.json');
    writeJson(receiptPath, receipt);
    if (process.env.FOLIOLE_T152_CELL_ID) {
      writeFriTwoDeviceCellReceipt({ applicationId: bundle.applicationId,
        buildIdentity: acceptedTip, evidenceRoot, providerHost: 'windows',
        providerLibrary: windows.receipt.libraryLocator,
        input: { automaticBeforeRestartHost: 'fri',
          business: { idempotent: true, twoWayUnion: true },
          conflict: windows.receipt.conflict,
          devices: { fri: { identity: friTimeline.identity },
            windows: { identity: windows.receipt.localDeviceIdentityKey } },
          failureLocator: evidenceRoot, groupId: receipt.groupId, groupTag: receipt.groupTag,
          rawRuns: receipt.runs } });
    }
    return { receipt, receiptPath };
  } finally {
    if (!providerSettled) await provider.cancelAndSettle();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const acceptedTip = process.argv[2];
  const evidenceRoot = process.argv[3];
  if (!/^[0-9a-f]{40}$/u.test(acceptedTip ?? '') || !evidenceRoot) {
    throw new Error('usage: windows-fri-two-device-sync <accepted-tip> <evidence-root>');
  }
  const result = await runWindowsFriTwoDeviceSync({ acceptedTip,
    evidenceRoot: path.resolve(evidenceRoot) });
  console.log(`[windows-fri-two-device-sync] status=success receipt=${result.receiptPath}`);
}
