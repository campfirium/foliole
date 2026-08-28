#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';

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
  const providerReceipt = path.join(evidenceRoot, 'provider-progress.json');
  const provider = startWindowsSyncGroupProvider({ action: 'two-device-sync-provider',
    execute: executor(evidenceRoot, 'windows-provider'), repoRoot,
    reportProgress: (milestone) => writeJson(providerReceipt, {
      acceptedTip, milestone, resultStatus: milestone === 'automatic-converged'
        ? 'automatic-converged' : milestone, schemaVersion: 1
    }) });
  let providerSettled = false;
  try {
    await provider.waitForProgress('provider-ready');
    const friRoot = path.join(evidenceRoot, 'fri-xcuitest');
    const fri = await executor(evidenceRoot, 'fri-xcuitest')('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', friRoot,
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch'
    ], { action: 'fri-two-device', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_T152_PROVIDER_RECEIPT_PATH: providerReceipt, FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 60 * 60_000, host: 'ios-b', stage: 'windows-fri-two-device' });
    if (fri.code !== 0) throw new Error('Fri physical two-Device XCUITest failed.');
    await provider.waitForProgress('automatic-converged');
    await provider.release('consumer_complete');
    const windows = await provider.finish(); providerSettled = true;
    const receipt = { acceptedTip, completedAt: new Date().toISOString(), friRoot,
      resultStatus: 'success', schemaVersion: 1,
      windowsEvidenceRoot: path.dirname(windows.evidenceRef) };
    const receiptPath = path.join(evidenceRoot, 'receipt.json');
    writeJson(receiptPath, receipt);
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
