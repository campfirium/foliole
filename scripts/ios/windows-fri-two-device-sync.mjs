#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';
import {
  friAcceptanceBundle, runFriSyncEventProjection
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

function preserveFriBatch(evidenceRoot, name) {
  const accepted = path.join(path.dirname(evidenceRoot),
    'fri-physical-acceptance/AppPhysicalUITests/accepted');
  fs.cpSync(accepted, path.join(evidenceRoot, 'fri-evidence', name), { recursive: true });
}

async function runFriBatch({ bundle, evidenceRoot, extraEnv = {}, name, repoRoot, test }) {
  const result = await executor(evidenceRoot, `fri-${name}`)('bash', [FRI_RUNNER,
    '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
    '--artifacts-dir', path.join(evidenceRoot, 'fri-xcuitest', name),
    '--keep-app-foreground', bundle.applicationId, '--test-without-building',
    '--only-testing', `AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/${test}`
  ], { action: `fri-two-device-${name}`, cwd: repoRoot, env: { ...process.env,
    FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix,
    FOLIOLE_T152_DESKTOP_FORK_LABEL: 'windows', FOLIOLE_T152_TWO_DEVICE: '1', ...extraEnv },
  hardDeadlineMs: 60 * 60_000, host: 'ios-b', stage: `windows-fri-${name}` });
  if (result.code !== 0) throw new Error(`Fri ${name} XCUITest failed.`);
  preserveFriBatch(evidenceRoot, name);
  return result;
}

export function assertWindowsConflictTrace(projection) {
  const versions = projection?.conflict_versions ?? [];
  const current = versions.filter((version) => version.is_current);
  if (current.length !== 1 || current[0].parents.length < 2
      || !['fri', 'windows'].every((fork) => current[0].forks.includes(fork))) {
    throw new Error('Fri database did not retain one Windows/Fri two-parent conflict version.');
  }
  const byId = new Map(versions.map((version) => [version.version_id, version]));
  const parents = current[0].parents.map((versionId) => byId.get(versionId));
  if (parents.some((version) => !version)
      || !['fri', 'windows'].every((fork) => parents.some((version) => version.forks.includes(fork)))) {
    throw new Error('Fri database did not retain both Windows and Fri parent versions.');
  }
  return { contentHash: current[0].content_hash, objectId: current[0].object_id,
    parents: current[0].parents, versionId: current[0].version_id };
}

export async function runWindowsFriTwoDeviceSync({ acceptedTip, evidenceRoot,
  repoRoot = process.cwd() }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const bundle = friAcceptanceBundle(process.env.FOLIOLE_ACCEPTANCE_TASK_ID);
  const provider = startWindowsSyncGroupProvider({ action: 'two-device-sync-provider',
    execute: executor(evidenceRoot, 'windows-provider'), repoRoot,
    sourceRef: 'refs/heads/sync' });
  let providerSettled = false;
  try {
    await provider.waitForProgress('provider-ready');
    const providerIdentity = await provider.waitForGroupIdentity();
    const friRoot = path.join(evidenceRoot, 'fri-xcuitest');
    await runFriBatch({ bundle, evidenceRoot, name: 'join', repoRoot,
      test: 'testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch', extraEnv: {
      FOLIOLE_PHYSICAL_SYNC_GROUP_ID: providerIdentity.groupId,
      FOLIOLE_T152_EXPECTED_GROUP_ID: providerIdentity.groupId,
      FOLIOLE_T152_EXPECTED_GROUP_TAG: providerIdentity.groupTag } });
    await provider.waitForProgress('conflict-fork-ready');
    await runFriBatch({ bundle, evidenceRoot, name: 'conflict-fork', repoRoot,
      test: 'testForksTwoDeviceConflict' });
    await provider.release('consumer_complete');
    await runFriBatch({ bundle, evidenceRoot, name: 'conflict-publish', repoRoot,
      test: 'testPublishesTwoDeviceConflictFork' });
    await provider.waitForProgress('restarted');
    await runFriBatch({ bundle, evidenceRoot, name: 'conflict-pull', repoRoot,
      test: 'testPullsTwoDeviceConflictAfterProviderConverges' });
    const conflictProjection = await runFriSyncEventProjection({ buildIdentity: acceptedTip,
      desktopForkLabel: 'windows', evidenceRoot: path.join(evidenceRoot, 'fri-conflict-projection'),
      execute: executor(evidenceRoot, 'fri-conflict-projection'), repoRoot, bundle,
      runnerArgs: ['--test-without-building'] });
    const conflictTrace = assertWindowsConflictTrace(conflictProjection.value);
    await runFriBatch({ bundle, evidenceRoot, name: 'conflict-verify', repoRoot,
      test: 'testVerifiesTwoDeviceConflictAfterProviderConverges' });
    await provider.release('consumer_complete');
    const syncEvents = await runFriSyncEventProjection({ buildIdentity: acceptedTip,
      evidenceRoot: path.join(evidenceRoot, 'fri-sync-events'),
      execute: executor(evidenceRoot, 'fri-sync-events'), repoRoot, bundle,
      desktopForkLabel: 'windows', runnerArgs: ['--test-without-building'] });
    await provider.waitForProgress('automatic-converged');
    const windows = await provider.finish(); providerSettled = true;
    const friTimeline = buildFriRunTimeline(syncEvents.value, bundle.applicationId);
    const receipt = { acceptedTip, completedAt: new Date().toISOString(), friRoot,
      resultStatus: 'success', schemaVersion: 1,
      acceptanceApplicationId: bundle.applicationId,
      groupId: providerIdentity.groupId, groupTag: providerIdentity.groupTag,
      conflictProjection: conflictProjection.file, conflictTrace,
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
