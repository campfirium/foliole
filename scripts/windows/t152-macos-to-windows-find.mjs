#!/usr/bin/env node
/* global Buffer, URL */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createT152DesktopDnsSdLibrary } from
  '../desktop/t152-desktop-dnssd-library.mjs';
import { runT152WindowsFormal } from './t152-windows-capsule-control.mjs';

const PRODUCT_COMMIT = '86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a';
const PRODUCT_TREE = 'ec8af4a625d98fb35e86134d8770c50a5e669ccb';

async function productModules(productSource) {
  const root = pathToFileURL(`${productSource}${path.sep}`);
  return Promise.all([
    import(new URL('scripts/android/macos-sync-group-desktop-session.mjs', root)),
    import(new URL('scripts/sync-group/multi-device-sync-macos-channel.mjs', root))
  ]);
}

function registrationLifecycle(logPath) {
  const events = fs.readFileSync(logPath, 'utf8').split(/\r?\n/u).flatMap((line) => {
    const match = /\[desktop-dnssd\] (\{.*\})$/u.exec(line);
    if (!match) return [];
    try { return [JSON.parse(match[1])]; } catch { return []; }
  });
  const completedIndex = events.findIndex((event) => event.event === 'register_completed');
  const completed = events[completedIndex];
  const startedIndex = events.findIndex((event) => event.event === 'register_started'
    && event.lifecycle === completed?.lifecycle && event.name === completed?.name);
  if (startedIndex < 0 || completedIndex <= startedIndex) {
    throw new Error('Mac advertisement did not reach register_started then register_completed.');
  }
  return { completed, completedIndex, started: events[startedIndex], startedIndex };
}

function checkpoint(group, preflight, bytes, lifecycle) {
  const identityKey = group?.local_device_identity_key;
  const parsed = JSON.parse(identityKey ?? 'null');
  if (!Array.isArray(parsed) || parsed[1] !== group.group_id
      || parsed[3] !== preflight.canonicalLibraryPath
      || identityKey !== preflight.identityKey || bytes !== preflight.deviceIdTxtEntryBytes
      || !/^[0-9a-f]{32}$/u.test(group.group_tag ?? '')) {
    throw new Error('Mac G4a identity checkpoint diverged from fixed product facts.');
  }
  return { anchor: { type: typeof parsed[2], utf8Bytes: Buffer.byteLength(parsed[2], 'utf8'),
    value: parsed[2] }, deviceId: identityKey, deviceIdTxtEntryBytes: bytes,
  groupId: group.group_id, groupTag: group.group_tag, libraryPath: parsed[3],
  registration: lifecycle, validatorAccepted: true };
}

export async function runT152MacosToWindowsCheckpoint({ evidenceRoot, prepared,
  productSource, rootId, taskBaseRoot }) {
  const identity = prepared?.capsule?.manifest?.identity;
  if (identity?.productCommit !== PRODUCT_COMMIT || identity.productTree !== PRODUCT_TREE
      || !path.isAbsolute(evidenceRoot ?? '') || !path.isAbsolute(taskBaseRoot ?? '')) {
    throw new Error('T152 G4a fixed identity or roots are invalid.');
  }
  fs.mkdirSync(evidenceRoot, { recursive: false });
  const library = createT152DesktopDnsSdLibrary({ baseRoot: taskBaseRoot,
    evidenceRoot, rootId, sourceRoot: productSource });
  const [macos, channel] = await productModules(productSource);
  const runtimeLogPath = path.join(evidenceRoot, 'macos-runtime.log');
  const session = await macos.openMacosSyncGroupDesktopSession({ env: channel.macosAcceptanceEnv(),
    libraryHome: library.libraryRoot, operationId: rootId, repoRoot: productSource,
    runtimeLogPath, runtimeRoot: path.join(evidenceRoot, 'macos-runtime') });
  const locatorPath = path.join(evidenceRoot, 'locator.json');
  try {
    const group = (await session.enable()).sync_group;
    const preflight = await session.loadDnsSdIdentityPreflight(group?.group_id);
    const bytes = await session.validateDnsSdIdentity(group.local_device_identity_key);
    const formalEntry = checkpoint(group, preflight, bytes, registrationLifecycle(runtimeLogPath));
    const windows = await runT152WindowsFormal({
      action: 't152-desktop-dnssd-find-checkpoint',
      expectedGroupId: formalEntry.groupId, expectedGroupTag: formalEntry.groupTag,
      expectedProviderDeviceId: formalEntry.deviceId, prepared, rootId
    });
    const candidate = windows.receipt.result.candidate;
    if (candidate?.groupId !== formalEntry.groupId || candidate.groupTag !== formalEntry.groupTag
        || candidate.providerDeviceId !== formalEntry.deviceId
        || windows.receipt.result.requestSent !== false) {
      throw new Error('Windows G4b1 candidate diverged from the Mac product facts.');
    }
    const locator = { completedAt: new Date().toISOString(), formalAttempt: {
      allocated: true, started: true }, formalEntry, identity, requestSent: false,
    resultStatus: 'success', rootId, schemaVersion: 2, windows: windows.receipt.result };
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`);
    return { locator, locatorPath };
  } catch (error) {
    fs.writeFileSync(locatorPath, `${JSON.stringify({ completedAt: new Date().toISOString(),
      error: error.message, identity, resultStatus: 'failure', rootId, schemaVersion: 2 }, null, 2)}\n`);
    throw Object.assign(error, { locatorPath });
  } finally { await session.close().catch(() => undefined); }
}
