#!/usr/bin/env node
/* global AbortController, console, process */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import {
  openMacosSyncGroupDesktopSession, waitForMacosDeviceRequest
} from '../android/macos-sync-group-desktop-session.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';

const execute = promisify(execFile);

async function acceptedRevision(repoRoot) {
  const { stdout } = await execute('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return stdout.trim();
}

async function runWindows(repoRoot, signal) {
  return execute(process.execPath,
    ['scripts/windows/windows-dev-control.mjs', 'single-principal-sync-group'], {
      cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      signal, timeout: 20 * 60_000
    });
}

export async function runMacosWindowsSinglePrincipalSyncGroup({
  repoRoot = process.cwd(), runWindowsAction = runWindows
} = {}) {
  const acceptedTip = await acceptedRevision(repoRoot);
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/t152-7-windows', acceptedTip);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
    libraryHome: path.join(evidenceRoot, 'macos-library'), repoRoot,
    runtimeRoot: path.join(evidenceRoot, 'macos-runtime') });
  const controller = new AbortController();
  try {
    const initial = await session.enable();
    const windowsWork = runWindowsAction(repoRoot, controller.signal);
    const request = await waitForMacosDeviceRequest(session, null, { timeoutMs: 15 * 60_000 });
    const accepted = await session.accept(request.request_id);
    const windows = await windowsWork;
    const identity = /\[windows-dev-action\] single-principal-sync-group identity=([A-Za-z0-9.-]+)/u
      .exec(windows.stdout)?.[1];
    if (!identity) throw new Error('Windows did not report fixed Device evidence.');
    const windowsEvidenceRoot = path.join(
      repoRoot, '.tmp/artifacts/multi-device-sync/windows-c', identity
    );
    const windowsReceipt = JSON.parse(fs.readFileSync(path.join(windowsEvidenceRoot,
      'single-principal-sync-group-receipt.json'), 'utf8'));
    if (windowsReceipt.resultStatus !== 'success' || windowsReceipt.localDevicePersisted !== true) {
      throw new Error('Windows did not persist its accepted Device.');
    }
    const receipt = { acceptedTip, completedAt: new Date().toISOString(),
      deviceCount: accepted.sync_group?.devices?.length ?? 0,
      groupId: accepted.sync_group?.group_id ?? null,
      macosProviderPort: initial.server_status.port, requestId: request.request_id,
      resultStatus: 'success', schemaVersion: 1,
      windowsEvidenceRoot };
    const receiptPath = path.join(evidenceRoot, 'receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    console.log(`[macos-windows-single-principal] status=success receipt=${receiptPath}`);
    return { receipt, receiptPath };
  } catch (error) {
    controller.abort();
    throw error;
  } finally { await session.close().catch(() => undefined); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runMacosWindowsSinglePrincipalSyncGroup().catch((error) => {
    console.error(`[macos-windows-single-principal] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
