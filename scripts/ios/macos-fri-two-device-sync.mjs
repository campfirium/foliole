#!/usr/bin/env node
/* global AbortController, clearTimeout, console, process, setTimeout */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { runFriSyncGroupProvider } from './fri-sync-group-provider.mjs';
import { writeFriTwoDeviceCellReceipt } from './fri-two-device-cell-receipt.mjs';
import { buildFriRunTimeline } from './fri-two-device-run-proof.mjs';
import {
  friAcceptanceBundle, runFriSyncEventProjection
} from './ios-acceptance-sync-event-projection.mjs';

const FRI_RUNNER = '/Users/roamer/.codex/skills/ios-physical-acceptance/scripts/run-fri-xcuitest.sh';

export function createStateSignals() {
  const waiting = new Map();
  const values = new Map();
  let failure;
  const waitFor = (status, timeoutMs) => {
    if (failure) return Promise.reject(failure);
    if (values.has(status)) return Promise.resolve(values.get(status));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiting.delete(status);
        reject(new Error(`Timed out waiting for provider state: ${status}`));
      }, timeoutMs);
      waiting.set(status, { reject, resolve: (value) => {
        clearTimeout(timeout); resolve(value);
      } });
    });
  };
  const publish = (value) => {
    values.set(value.resultStatus, value);
    waiting.get(value.resultStatus)?.resolve(value);
    waiting.delete(value.resultStatus);
  };
  const fail = (error) => {
    failure = error instanceof Error ? error : new Error(String(error));
    for (const waiter of waiting.values()) waiter.reject(failure);
    waiting.clear();
  };
  return { fail, publish, waitFor };
}

export function assertConvergedConflictTrace(projection) {
  const versions = projection?.conflict_versions ?? [];
  const current = versions.filter((version) => version.is_current);
  if (current.length !== 1 || current[0].parents.length < 2
      || !['fri', 'macos'].every((fork) => current[0].forks.includes(fork))) {
    throw new Error('Fri database did not retain one converged two-parent conflict version.');
  }
  const byId = new Map(versions.map((version) => [version.version_id, version]));
  const parents = current[0].parents.map((versionId) => byId.get(versionId));
  if (parents.some((version) => !version)
      || !['fri', 'macos'].every((fork) => parents.some((version) => version.forks.includes(fork)))) {
    throw new Error('Fri database did not retain both concurrent parent versions.');
  }
  return { contentHash: current[0].content_hash, objectId: current[0].object_id,
    parents: current[0].parents, versionId: current[0].version_id };
}

function createReleaseGate() {
  const waiting = [];
  let closed;
  return {
    close(value) {
      closed = value;
      while (waiting.length) waiting.shift()(value);
    },
    release(value) {
      waiting.shift()?.(value);
    },
    wait() {
      return closed ? Promise.resolve(closed)
        : new Promise((resolve) => waiting.push(resolve));
    }
  };
}

function preserveFriBatch(evidenceRoot, name) {
  const accepted = path.join(path.dirname(evidenceRoot),
    'fri-physical-acceptance/AppPhysicalUITests/accepted');
  fs.cpSync(accepted, path.join(evidenceRoot, 'fri-evidence', name), { recursive: true });
}

export async function runMacosFriTwoDeviceSync({ acceptedTip, evidenceRoot,
  repoRoot = process.cwd() }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const bundle = friAcceptanceBundle(process.env.FOLIOLE_ACCEPTANCE_TASK_ID);
  const providerRoot = path.join(evidenceRoot, 'macos-provider');
  const signals = createStateSignals();
  const releaseGate = createReleaseGate();
  const providerAbort = new AbortController();
  const provider = runFriSyncGroupProvider({ acceptanceRoot: path.join(evidenceRoot, 'shared'),
    evidenceRoot: providerRoot, repoRoot, twoDevice: true,
    abortSignal: providerAbort.signal, onState: signals.publish,
    waitForRelease: releaseGate.wait }).then((value) => ({ value }), (error) => {
      signals.fail(error); return { error };
    });
  const ready = await signals.waitFor('ready', 3 * 60_000);
  const friRoot = path.join(evidenceRoot, 'fri-xcuitest');
  const execute = createActionExecutor({ logPath: path.join(evidenceRoot, 'fri-xcuitest.log'),
    progressPath: path.join(evidenceRoot, 'fri-xcuitest-progress.jsonl') });
  let fri;
  let providerFailure;
  try {
    fri = await execute('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'join'),
      '--keep-app-foreground', bundle.applicationId,
      '--test-without-building',
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch'
    ], { action: 'fri-two-device', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix,
      FOLIOLE_PHYSICAL_SYNC_GROUP_ID: ready.groupId,
      FOLIOLE_T152_EXPECTED_GROUP_ID: ready.groupId,
      FOLIOLE_T152_EXPECTED_GROUP_TAG: ready.groupTag, FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 60 * 60_000, host: 'ios-b', stage: 'macos-fri-two-device' });
    if (fri.code !== 0) throw new Error('Fri physical two-Device XCUITest failed.');
    preserveFriBatch(evidenceRoot, 'join');
    await signals.waitFor('conflict-fork-ready', 12 * 60_000);
    const conflictFork = await execute('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'conflict'),
      '--keep-app-foreground', bundle.applicationId,
      '--test-without-building',
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testForksTwoDeviceConflict'
    ], { action: 'fri-two-device-conflict', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix, FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 45 * 60_000, host: 'ios-b', stage: 'macos-fri-conflict-fork' });
    if (conflictFork.code !== 0) throw new Error('Fri conflict fork XCUITest failed.');
    preserveFriBatch(evidenceRoot, 'conflict-fork');
    releaseGate.release('consumer_complete');
    const conflictPublish = await execute('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'conflict-publish'),
      '--keep-app-foreground', bundle.applicationId,
      '--test-without-building',
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testPublishesTwoDeviceConflictFork'
    ], { action: 'fri-two-device-conflict-publish', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix, FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 15 * 60_000, host: 'ios-b', stage: 'macos-fri-conflict-publish' });
    if (conflictPublish.code !== 0) throw new Error('Fri conflict publish XCUITest failed.');
    preserveFriBatch(evidenceRoot, 'conflict-publish');
    await signals.waitFor('automatic-converged', 5 * 60_000);
    const conflictPull = await execute('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'conflict-pull'),
      '--keep-app-foreground', bundle.applicationId,
      '--test-without-building',
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testPullsTwoDeviceConflictAfterProviderConverges'
    ], { action: 'fri-two-device-conflict-pull', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix, FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 15 * 60_000, host: 'ios-b', stage: 'macos-fri-conflict-pull' });
    if (conflictPull.code !== 0) throw new Error('Fri conflict pull XCUITest failed.');
    preserveFriBatch(evidenceRoot, 'conflict-pull');
    fri.conflictProjection = await runFriSyncEventProjection({ buildIdentity: acceptedTip,
      evidenceRoot: path.join(evidenceRoot, 'fri-conflict-projection'), execute, repoRoot, bundle,
      runnerArgs: ['--test-without-building'] });
    fri.conflictTrace = assertConvergedConflictTrace(fri.conflictProjection.value);
    const conflictVerify = await execute('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', path.join(friRoot, 'conflict-verify'),
      '--keep-app-foreground', bundle.applicationId,
      '--test-without-building',
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testVerifiesTwoDeviceConflictAfterProviderConverges'
    ], { action: 'fri-two-device-conflict-verify', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix, FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 15 * 60_000, host: 'ios-b', stage: 'macos-fri-conflict-verify' });
    if (conflictVerify.code !== 0) throw new Error('Fri conflict/restart XCUITest failed.');
    preserveFriBatch(evidenceRoot, 'conflict-verify');
    fri = { ...fri, syncEvents: await runFriSyncEventProjection({ buildIdentity: acceptedTip,
      evidenceRoot: path.join(evidenceRoot, 'fri-sync-events'), execute, repoRoot, bundle,
      runnerArgs: ['--test-without-building'] }) };
  } catch (error) {
    providerAbort.abort(error);
    throw error;
  } finally {
    releaseGate.close('consumer_complete');
    const providerResult = await provider;
    providerFailure = providerResult.error;
    if (!providerFailure) fri = { ...fri, provider: providerResult.value };
  }
  if (providerFailure) throw providerFailure;
  const friTimeline = buildFriRunTimeline(fri.syncEvents.value, bundle.applicationId);
  const receipt = { acceptedTip, completedAt: new Date().toISOString(), friRoot,
    friEvidenceRoot: path.join(evidenceRoot, 'fri-evidence'),
    conflictProjection: fri.conflictProjection.file, conflictTrace: fri.conflictTrace,
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
