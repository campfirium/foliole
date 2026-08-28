#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
    const a5 = await executor(evidenceRoot, 'a5-formal')(process.execPath,
      ['scripts/android/macos-a5-dev.mjs', 'single-principal-sync-group', '--formal'], {
        action: 'a5-two-device', cwd: repoRoot,
        env: { ...process.env, FOLIOLE_T152_ACCEPTANCE_ROOT: path.join(evidenceRoot, 'a5'),
          FOLIOLE_T152_SYNC_CREATOR: 'windows' }, hardDeadlineMs: 90 * 60_000,
        host: 'android-b', stage: 'windows-a5-two-device'
      });
    if (a5.code !== 0 || !a5.stdout.includes(`[macos-a5-dev] accepted-tip=${acceptedTip}`)) {
      throw new Error(`A5 formal two-Device journey failed: ${a5.stderr.trim()}`);
    }
    await provider.waitForProgress('automatic-converged');
    await provider.release('consumer_complete');
    const windows = await provider.finish(); providerSettled = true;
    const receipt = { acceptedTip, completedAt: new Date().toISOString(),
      resultStatus: 'success', schemaVersion: 1,
      windowsEvidenceRoot: path.dirname(windows.evidenceRef) };
    const receiptPath = path.join(evidenceRoot, 'receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
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
