import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  loadDesktopDnsSdIdentityPreflight, validateDesktopDnsSdIdentity
} from '../desktop/desktop-dnssd-identity-preflight.mjs';
import { waitForWindowsSyncGroupProviderRelease } from
  './windows-sync-group-provider-release.mjs';
import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import {
  invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession, windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';

const ACTION = 'desktop-dnssd-advertise-acceptance';

export async function runWindowsDesktopDnsSdAdvertiseAcceptance(options) {
  provisionWindowsAcceptanceRoot({ paths: options.paths });
  const client = windowsSyncGroupClientPaths(options.paths);
  fs.rmSync(path.dirname(client.libraryHome), { force: true, recursive: true });
  fs.mkdirSync(client.libraryHome, { recursive: true });
  fs.mkdirSync(client.userData, { recursive: true });
  const session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let receipt;
  try {
    const preflight = await loadDesktopDnsSdIdentityPreflight(
      session.app, `group-${randomUUID()}`
    );
    const created = await invokeWindowsSyncGroupCommand(session.page, 'create_sync_group');
    const group = created.sync_group;
    const identityKey = group?.local_device_identity_key;
    if (!/^group-[0-9a-f-]{36}$/u.test(group?.group_id ?? '')
        || !/^[0-9a-f]{32}$/u.test(group?.group_tag ?? '') || !identityKey) {
      throw new Error('Windows did not create a formal one-Device advertisement.');
    }
    const actualTxtBytes = await validateDesktopDnsSdIdentity(session.app, identityKey);
    const actual = JSON.parse(identityKey);
    if (actual[3] !== preflight.canonicalLibraryPath
        || actualTxtBytes !== preflight.deviceIdTxtEntryBytes) {
      throw new Error('Windows formal Device identity diverged from its DNS-SD preflight.');
    }
    options.reportProgress({ factId: ACTION, groupId: group.group_id,
      groupTag: group.group_tag, milestone: 'provider-ready' });
    await waitForWindowsSyncGroupProviderRelease({ action: ACTION,
      repoRoot: options.paths.repoRoot });
    receipt = { buildIdentity: options.buildIdentity, completedAt: new Date().toISOString(),
      deviceIdTxtEntryBytes: actualTxtBytes, groupId: group.group_id,
      groupTag: group.group_tag, libraryPath: actual[3], processId: session.app.process().pid,
      requestSent: false, resultStatus: 'success', schemaVersion: 1 };
  } finally {
    await closeWindowsSyncGroupSession(session);
  }
  const manifestPath = path.join(options.evidenceRoot, `${ACTION}-receipt.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { desktopDnsSdAdvertiseAcceptance: { manifestPath }, output: '' };
}
