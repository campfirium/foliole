import fs from 'node:fs';
import path from 'node:path';

import { waitForDesktopProductState } from '../acceptance/desktop-product-event.mjs';
import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import {
  invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession, windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';

const ACTIONS = new Set(['desktop-dnssd-find-acceptance', 'desktop-dnssd-find-diagnostic']);

export async function runWindowsDesktopDnsSdFindDiagnostic(options) {
  const action = options.action;
  if (!ACTIONS.has(action)) throw new Error('Windows DNS-SD Find action is invalid.');
  if (!/^group-[0-9a-f-]{36}$/u.test(options.expectedGroupId ?? '')
      || !/^[0-9a-f]{32}$/u.test(options.expectedGroupTag ?? '')) {
    throw new Error('Windows DNS-SD diagnostic requires exact Mac group identity.');
  }
  provisionWindowsAcceptanceRoot({ paths: options.paths });
  const client = windowsSyncGroupClientPaths(options.paths);
  fs.rmSync(path.dirname(client.libraryHome), { force: true, recursive: true });
  fs.mkdirSync(client.libraryHome, { recursive: true });
  fs.mkdirSync(client.userData, { recursive: true });
  const session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  const processId = session.app.process().pid;
  let candidate;
  try {
    await invokeWindowsSyncGroupCommand(session.page, 'enable_companion_sync');
    const overview = await waitForDesktopProductState(session.page, {
      command: 'load_sync_group_overview', condition: {
        groupId: options.expectedGroupId, groupTag: options.expectedGroupTag,
        kind: 'candidate-identity'
      }, eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 2 * 60_000,
      triggerCommand: 'discover_sync_groups'
    });
    const matches = overview.join_candidates.filter((item) =>
      item.group_id === options.expectedGroupId && item.group_tag === options.expectedGroupTag);
    if (matches.length !== 1) throw new Error('Windows DNS-SD diagnostic candidate was not unique.');
    [candidate] = matches;
    options.reportProgress({ factId: action,
      milestone: 'candidate-found' });
  } finally {
    await closeWindowsSyncGroupSession(session);
  }
  const manifestPath = path.join(options.evidenceRoot, `${action}-receipt.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    buildIdentity: options.buildIdentity, completedAt: new Date().toISOString(),
    groupId: candidate.group_id, groupTag: candidate.group_tag,
    processId, requestSent: false, resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  const key = action === 'desktop-dnssd-find-acceptance'
    ? 'desktopDnsSdFindAcceptance' : 'desktopDnsSdFindDiagnostic';
  return { [key]: { manifestPath }, output: '' };
}
