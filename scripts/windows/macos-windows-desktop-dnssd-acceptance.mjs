#!/usr/bin/env node
/* global console, process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { openMacosSyncGroupDesktopSession } from
  '../android/macos-sync-group-desktop-session.mjs';
import { createT152DesktopDnsSdLibrary } from
  '../desktop/t152-desktop-dnssd-library.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from
  '../sync-group/multi-device-sync-windows-provider.mjs';

function requiredRevision() {
  const revision = process.env.FOLIOLE_T152_ACCEPTANCE_REVISION?.trim();
  if (!/^[0-9a-f]{40}$/u.test(revision ?? '')) {
    throw new Error('T152 desktop DNS-SD acceptance revision is required.');
  }
  return revision;
}

function shortLibrary({ attemptId, evidenceRoot, repoRoot }) {
  const baseRoot = process.env.FOLIOLE_T152_SHORT_LIBRARY_ROOT?.trim();
  if (!baseRoot) throw new Error('T152 desktop DNS-SD short library root is required.');
  return createT152DesktopDnsSdLibrary({ attemptId, baseRoot, evidenceRoot,
    sourceRoot: repoRoot });
}

async function openSession({ attemptId, evidenceRoot, libraryHome, repoRoot }) {
  return openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(), libraryHome,
    operationId: attemptId, repoRoot,
    runtimeLogPath: path.join(evidenceRoot, 'macos-runtime.log'),
    runtimeRoot: path.join(evidenceRoot, 'macos-runtime') });
}

function actualIdentity(group, preflight) {
  const identityKey = group?.local_device_identity_key;
  if (!identityKey) throw new Error('Mac formal Device identity is missing.');
  const parsed = JSON.parse(identityKey);
  if (parsed[3] !== preflight.canonicalLibraryPath) {
    throw new Error('Mac formal Device identity diverged from its canonical preflight path.');
  }
  return { identityKey, libraryPath: parsed[3] };
}

async function macosAdvertisesToWindows({ evidenceRoot, repoRoot, state }) {
  const attemptId = randomUUID();
  const library = shortLibrary({ attemptId, evidenceRoot, repoRoot });
  Object.assign(state, { attemptId, evidenceRoot, libraryPath: library.libraryHome,
    phase: 'macos-to-windows' });
  const session = await openSession({ attemptId, evidenceRoot, libraryHome: library.libraryHome,
    repoRoot });
  const executor = createActionExecutor({ logPath: path.join(evidenceRoot, 'windows-action.log'),
    progressPath: path.join(evidenceRoot, 'windows-progress.jsonl') });
  let provider;
  let settled = false;
  try {
    const preflight = await session.loadDnsSdIdentityPreflight(`group-${randomUUID()}`);
    const created = await session.enable();
    const group = created.sync_group;
    const identity = actualIdentity(group, preflight);
    const actualTxtBytes = await session.validateDnsSdIdentity(identity.identityKey);
    if (actualTxtBytes !== preflight.deviceIdTxtEntryBytes) {
      throw new Error('Mac formal Device identity size diverged from DNS-SD preflight.');
    }
    provider = startWindowsSyncGroupProvider({ action: 'desktop-dnssd-find-acceptance',
      execute: executor, expectedGroupId: group.group_id, expectedGroupTag: group.group_tag,
      repoRoot });
    await provider.waitForProgress('candidate-found');
    const windows = await provider.finish();
    settled = true;
    return { attemptId, deviceIdTxtEntryBytes: actualTxtBytes,
      groupId: group.group_id, groupTag: group.group_tag, libraryPath: identity.libraryPath,
      macosProcessId: session.processId, requestSent: false,
      windowsEvidence: windows.evidenceRef, windowsProcessId: windows.receipt.processId };
  } finally {
    await session.close().catch(() => undefined);
    if (provider && !settled) await provider.cancelAndSettle();
  }
}

async function windowsAdvertisesToMacos({ evidenceRoot, repoRoot, state }) {
  const attemptId = randomUUID();
  const library = shortLibrary({ attemptId, evidenceRoot, repoRoot });
  Object.assign(state, { attemptId, evidenceRoot, libraryPath: library.libraryHome,
    phase: 'windows-to-macos' });
  const executor = createActionExecutor({ logPath: path.join(evidenceRoot, 'windows-action.log'),
    progressPath: path.join(evidenceRoot, 'windows-progress.jsonl') });
  const provider = startWindowsSyncGroupProvider({
    action: 'desktop-dnssd-advertise-acceptance', execute: executor, repoRoot
  });
  let session;
  let settled = false;
  try {
    const expected = await provider.waitForGroupIdentity();
    session = await openSession({ attemptId, evidenceRoot, libraryHome: library.libraryHome,
      repoRoot });
    const preflight = await session.loadDnsSdIdentityPreflight(expected.groupId);
    const overview = await session.waitForState({ command: 'load_sync_group_overview',
      condition: { groupId: expected.groupId, groupTag: expected.groupTag,
        kind: 'candidate-identity' }, eventName: 'onSyncGroupDiscoveryChanged',
      timeoutMs: 2 * 60_000, triggerCommand: 'discover_sync_groups' });
    const matches = overview.join_candidates.filter((candidate) =>
      candidate.group_id === expected.groupId && candidate.group_tag === expected.groupTag);
    if (matches.length !== 1) throw new Error('Mac formal Find candidate was not unique.');
    await session.invoke('stop_discover_sync_groups');
    await provider.release('consumer_complete');
    const windows = await provider.finish();
    settled = true;
    return { attemptId, groupId: expected.groupId, groupTag: expected.groupTag,
      libraryPath: preflight.canonicalLibraryPath, macosProcessId: session.processId,
      requestSent: false, windowsEvidence: windows.evidenceRef,
      windowsLibraryPath: windows.receipt.libraryPath,
      windowsProcessId: windows.receipt.processId };
  } finally {
    await session?.close().catch(() => undefined);
    if (!settled) await provider.cancelAndSettle();
  }
}

export async function runMacosWindowsDesktopDnsSdAcceptance({ repoRoot = process.cwd() } = {}) {
  const revision = requiredRevision();
  const attemptRoot = path.join(repoRoot, '.tmp', 'artifacts',
    't152-15-desktop-dnssd-acceptance', revision, randomUUID());
  const firstRoot = path.join(attemptRoot, '01-macos-to-windows');
  fs.mkdirSync(firstRoot, { recursive: true });
  const locatorPath = path.join(attemptRoot, 'locator.json');
  const state = {};
  try {
    const macosToWindows = await macosAdvertisesToWindows({
      evidenceRoot: firstRoot, repoRoot, state
    });
    const secondRoot = path.join(attemptRoot, '02-windows-to-macos');
    fs.mkdirSync(secondRoot, { recursive: true });
    const windowsToMacos = await windowsAdvertisesToMacos({
      evidenceRoot: secondRoot, repoRoot, state
    });
    const locator = { completedAt: new Date().toISOString(), macosToWindows, requestSent: false,
      resultStatus: 'success', revision, schemaVersion: 1, windowsToMacos };
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`, 'utf8');
    console.log(`[desktop-dnssd-acceptance] status=success locator=${locatorPath}`);
    return { locator, locatorPath };
  } catch (error) {
    const locator = { ...state, completedAt: new Date().toISOString(), error: error.message,
      requestSent: false, resultStatus: 'failure', revision, schemaVersion: 1 };
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`, 'utf8');
    throw Object.assign(error, { locatorPath });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runMacosWindowsDesktopDnsSdAcceptance().catch((error) => {
    console.error(`[desktop-dnssd-acceptance] status=failed message=${error.message}`
      + `${error.locatorPath ? ` locator=${error.locatorPath}` : ''}`);
    process.exitCode = 1;
  });
}
