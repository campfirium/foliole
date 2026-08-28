#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { writeT152TwoDeviceCellReceipt } from '../acceptance/t152-two-device-cell-receipt.mjs';
import {
  buildT152TwoDeviceProof, writeT152ResourceLocator
} from '../acceptance/t152-two-device-proof-builder.mjs';
import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';

function executor(root, name) {
  return createActionExecutor({ logPath: path.join(root, `${name}.log`),
    progressPath: path.join(root, `${name}-progress.jsonl`) });
}

export async function runWindowsA5TwoDeviceSync({ acceptedTip, evidenceRoot,
  repoRoot = process.cwd() }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const provider = startWindowsSyncGroupProvider({ action: 'two-device-sync-provider',
    execute: executor(evidenceRoot, 'windows-provider'), repoRoot });
  let providerSettled = false;
  try {
    await provider.waitForProgress('provider-ready');
    const providerIdentity = await provider.waitForGroupIdentity();
    let releaseTask;
    let writeA5Input;
    const a5 = await executor(evidenceRoot, 'a5-formal')(process.execPath,
      ['scripts/android/macos-a5-dev.mjs', 'single-principal-sync-group', '--formal'], {
        action: 'a5-two-device', cwd: repoRoot,
        env: { ...process.env, FOLIOLE_T152_ACCEPTANCE_ROOT: path.join(evidenceRoot, 'a5'),
          FOLIOLE_T152_EXPECTED_GROUP_ID: providerIdentity.groupId,
          FOLIOLE_T152_EXPECTED_GROUP_TAG: providerIdentity.groupTag,
          FOLIOLE_T152_SYNC_CREATOR: 'windows' }, hardDeadlineMs: 90 * 60_000,
        host: 'android-b', stage: 'windows-a5-two-device',
        onSpawn: ({ writeInput }) => { writeA5Input = writeInput; },
        onOutput: ({ stdout }) => {
          if (!releaseTask && stdout.includes('[macos-a5-dev] t152-conflict-fork-ready')) {
            releaseTask = provider.waitForProgress('conflict-fork-ready')
              .then(() => provider.release('consumer_complete'))
              .then(() => writeA5Input?.('consumer_complete\n'));
          }
        }
      });
    if (a5.code !== 0 || !a5.stdout.includes(`[macos-a5-dev] accepted-tip=${acceptedTip}`)) {
      throw new Error(`A5 formal two-Device journey failed: ${a5.stderr.trim()}`);
    }
    if (!releaseTask) throw new Error('A5 did not publish its conflict-fork milestone.');
    await releaseTask;
    await provider.waitForProgress('automatic-converged');
    const windows = await provider.finish(); providerSettled = true;
    const a5EvidenceRoot = /^\[macos-a5-dev\] single-principal-sync-group evidence=(.+)$/mu
      .exec(a5.stdout)?.[1]?.trim();
    if (!a5EvidenceRoot) throw new Error('A5 two-Device evidence locator is missing.');
    const a5Receipt = JSON.parse(fs.readFileSync(path.join(a5EvidenceRoot, 'result.json'), 'utf8'));
    const windowsReceipt = windows.receipt;
    const receipt = { acceptedTip, completedAt: new Date().toISOString(),
      resultStatus: 'success', schemaVersion: 1,
      a5EvidenceRoot,
      windowsEvidenceRoot: path.dirname(windows.evidenceRef) };
    const receiptPath = path.join(evidenceRoot, 'receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    const a5Identity = a5Receipt.runs.a5.initial.deviceIdentityKey;
    const a5Locator = writeT152ResourceLocator(evidenceRoot, 'a5', {
      applicationId: 'com.foliole.android.acceptance', evidence: a5EvidenceRoot,
      identity: a5Identity, uninstalledAfterAttempt: true
    });
    const windowsLocator = writeT152ResourceLocator(evidenceRoot, 'windows', {
      identity: windowsReceipt.localDeviceIdentityKey,
      library: windowsReceipt.libraryLocator, receipt: windows.evidenceRef
    });
    writeT152TwoDeviceCellReceipt(buildT152TwoDeviceProof({
      automaticBeforeRestartHost: 'a5',
      builds: { a5: acceptedTip, windows: windowsReceipt.buildIdentity },
      business: { idempotent: true, twoWayUnion: true }, conflict: windowsReceipt.conflict,
      devices: { a5: { identity: a5Identity },
        windows: { identity: windowsReceipt.localDeviceIdentityKey } },
      failureLocator: evidenceRoot, groupId: providerIdentity.groupId,
      groupTag: providerIdentity.groupTag,
      libraries: [{ locator: windowsLocator }, { locator: a5Locator }],
      rawRuns: { a5: a5Receipt.runs.a5, windows: windowsReceipt.runs }
    }));
    return { receipt, receiptPath };
  } finally {
    if (!providerSettled) await provider.cancelAndSettle();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const acceptedTip = process.argv[2];
  const evidenceRoot = process.argv[3];
  if (!/^[0-9a-f]{40}$/u.test(acceptedTip ?? '') || !evidenceRoot) {
    throw new Error('usage: windows-a5-two-device-sync <accepted-tip> <evidence-root>');
  }
  const result = await runWindowsA5TwoDeviceSync({ acceptedTip,
    evidenceRoot: path.resolve(evidenceRoot) });
  console.log(`[windows-a5-two-device-sync] status=success receipt=${result.receiptPath}`);
}
