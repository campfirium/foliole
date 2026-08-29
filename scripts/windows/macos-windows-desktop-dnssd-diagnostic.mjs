#!/usr/bin/env node
/* global console, process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { openMacosSyncGroupDesktopSession } from
  '../android/macos-sync-group-desktop-session.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from
  '../sync-group/multi-device-sync-windows-provider.mjs';

export async function runMacosWindowsDesktopDnsSdDiagnostic({ repoRoot = process.cwd() } = {}) {
  const revision = process.env.FOLIOLE_T152_DIAGNOSTIC_REVISION?.trim();
  if (!/^[0-9a-f]{40}$/u.test(revision ?? '')) throw new Error('Diagnostic revision is required.');
  const attemptId = randomUUID();
  const root = path.join(repoRoot, '.tmp', 'artifacts', 't152-15-desktop-dnssd',
    revision, 'attempts', attemptId);
  fs.mkdirSync(root, { recursive: true });
  const session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
    libraryHome: path.join(root, 'macos-library'), operationId: attemptId, repoRoot,
    runtimeLogPath: path.join(root, 'macos-runtime.log'),
    runtimeRoot: path.join(root, 'macos-runtime') });
  const executor = createActionExecutor({ logPath: path.join(root, 'windows-action.log'),
    progressPath: path.join(root, 'windows-progress.jsonl') });
  let provider;
  let settled = false;
  try {
    const created = await session.enable();
    const groupId = created.sync_group?.group_id;
    const groupTag = created.sync_group?.group_tag;
    if (!/^group-[0-9a-f-]{36}$/u.test(groupId ?? '')
        || !/^[0-9a-f]{32}$/u.test(groupTag ?? '')) {
      throw new Error('Mac DNS-SD diagnostic did not create an exact Sync Group identity.');
    }
    provider = startWindowsSyncGroupProvider({ action: 'desktop-dnssd-find-diagnostic',
      execute: executor, expectedGroupId: groupId, expectedGroupTag: groupTag, repoRoot });
    await provider.waitForProgress('candidate-found');
    const windows = await provider.finish();
    settled = true;
    if (windows.receipt.groupId !== groupId || windows.receipt.groupTag !== groupTag
        || windows.receipt.requestSent !== false) {
      throw new Error('Windows DNS-SD diagnostic receipt changed group identity or sent a request.');
    }
    const locator = { attemptId, completedAt: new Date().toISOString(), groupId, groupTag,
      macosLibrary: path.join(root, 'macos-library'), requestSent: false,
      resultStatus: 'success', revision, schemaVersion: 1,
      windowsEvidence: windows.evidenceRef };
    const locatorPath = path.join(root, 'locator.json');
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`, 'utf8');
    console.log(`[desktop-dnssd-find-diagnostic] status=success locator=${locatorPath}`);
    return { locator, locatorPath };
  } finally {
    await session.close().catch(() => undefined);
    if (provider && !settled) await provider.cancelAndSettle();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runMacosWindowsDesktopDnsSdDiagnostic().catch((error) => {
    console.error(`[desktop-dnssd-find-diagnostic] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
