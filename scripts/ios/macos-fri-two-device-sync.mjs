#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { runFriSyncGroupProvider } from './fri-sync-group-provider.mjs';

const FRI_RUNNER = '/Users/roamer/.codex/skills/ios-physical-acceptance/scripts/run-fri-xcuitest.sh';

async function waitForStatus(receiptPath, status, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      if (value.resultStatus === status) return value;
    } catch { /* Provider receipt is not complete yet. */ }
    await delay(250);
  }
  throw new Error(`Mac provider did not reach ${status}.`);
}

export async function runMacosFriTwoDeviceSync({ acceptedTip, evidenceRoot,
  repoRoot = process.cwd() }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const providerRoot = path.join(evidenceRoot, 'macos-provider');
  let releaseProvider;
  const provider = runFriSyncGroupProvider({ acceptanceRoot: path.join(evidenceRoot, 'shared'),
    evidenceRoot: providerRoot, repoRoot, twoDevice: true,
    waitForRelease: () => new Promise((resolve) => { releaseProvider = resolve; }) });
  const providerReceipt = path.join(providerRoot, 'provider-receipt.json');
  await waitForStatus(providerReceipt, 'ready');
  const friRoot = path.join(evidenceRoot, 'fri-xcuitest');
  const execute = createActionExecutor({ logPath: path.join(evidenceRoot, 'fri-xcuitest.log'),
    progressPath: path.join(evidenceRoot, 'fri-xcuitest-progress.jsonl') });
  let fri;
  try {
    fri = await execute('bash', [FRI_RUNNER,
      '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', friRoot,
      '--only-testing', 'AppPhysicalUITests/FoliolePhysicalSyncGroupUITests/testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch'
    ], { action: 'fri-two-device', cwd: repoRoot, env: { ...process.env,
      FOLIOLE_T152_PROVIDER_RECEIPT_PATH: providerReceipt, FOLIOLE_T152_TWO_DEVICE: '1' },
    hardDeadlineMs: 60 * 60_000, host: 'ios-b', stage: 'macos-fri-two-device' });
    if (fri.code !== 0) throw new Error('Fri physical two-Device XCUITest failed.');
    await waitForStatus(providerReceipt, 'automatic-converged');
  } finally {
    releaseProvider?.('consumer_complete');
    await provider;
  }
  const receipt = { acceptedTip, completedAt: new Date().toISOString(), friRoot,
    groupId: JSON.parse(fs.readFileSync(providerReceipt, 'utf8')).groupId,
    resultStatus: 'success', schemaVersion: 1 };
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
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
