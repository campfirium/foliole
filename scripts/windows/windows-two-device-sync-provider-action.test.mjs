// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ root: '', reads: [], events: [], fault: false }));
const WINDOWS_BODY = 'Complete seed paragraph.\n\nDesktop fork windows exact writer body';
const MAC_BODY = 'Complete seed paragraph.\n\nDesktop fork macos exact writer body';
function proof() {
  return { nodeId: 'conflict', currentVersionId: 'windows#2', currentContent: WINDOWS_BODY,
    alternatives: [{ id: 'mac#2', content: MAC_BODY }], conflictCount: 1,
    resolution: 'body-alternatives', silentOverwrite: false, visible: true };
}
function group() { return { group_id: 'group', group_tag: 'a'.repeat(32),
  local_device_identity_key: 'windows', devices: ['windows', 'macos'] }; }
vi.mock('./windows-multi-device-sync-readiness.mjs', () => ({ provisionWindowsAcceptanceRoot: () => {} }));
vi.mock('./windows-sync-group-provider-release.mjs', () => ({ waitForWindowsSyncGroupProviderRelease: async () => {} }));
vi.mock('./windows-sync-group-session-close.mjs', () => ({ closeWindowsSyncGroupSession: async () => { host.events.push('close'); } }));
vi.mock('../desktop/sync-group-journey-fact-action.mjs', () => ({
  createDesktopSyncGroupJourneyFact: async () => ({ factId: 'fact' })
}));
vi.mock('../desktop/sync-group-conflict-action.mjs', () => ({
  createDesktopSyncConflictSeed: async () => ({ nodeId: 'conflict' }),
  forkDesktopSyncConflict: async () => ({ nodeId: 'conflict', content: WINDOWS_BODY }),
  loadConvergedDesktopSyncForks: async options => {
    host.events.push('proof');
    host.reads.push(options);
    const result = proof();
    if (host.fault && host.reads.length > 1) result.currentVersionId = 'unexpected-restarted-version';
    return result;
  }
}));
vi.mock('./windows-sync-group-recovery-action.mjs', () => ({
  windowsSyncGroupClientPaths: () => ({ libraryHome: path.join(host.root, 'client/library'),
    userData: path.join(host.root, 'client/user-data') }),
  openWindowsSyncGroupSession: async () => {
    host.events.push('open');
    return { app: { evaluate: async () => null }, page: {} };
  },
  invokeWindowsSyncGroupCommand: async (_page, command) => ({ sync_group: command === 'create_sync_group'
    ? { ...group(), devices: ['windows'] } : group() })
}));
vi.mock('../acceptance/desktop-product-event.mjs', () => ({
  waitForDesktopProductState: async (_page, args) => {
    if (args.condition.kind === 'join-request-count') return { join_requests: [{ request_id: 'request' }] };
    if (args.condition.kind === 'group') return { sync_group: group() };
    return { nodesById: { a: { title: 'Multi-device sync A fact' }, b: { title: 'Multi-device sync B fact' } } };
  }
}));

import { runWindowsTwoDeviceSyncProvider } from './windows-two-device-sync-provider-action.mjs';

afterEach(() => { if (host.root) fs.rmSync(host.root, { recursive: true, force: true }); });

function runProvider(fault = false) {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  Object.assign(host, { root: fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-fork-proof-')), reads: [], events: [], fault });
  return runWindowsTwoDeviceSyncProvider({ paths: {}, evidenceRoot: host.root, reportProgress: () => {} });
}

it('checks full Windows and Mac writer bodies across session close and reopen', async () => {
  await runProvider();
  expect(host.reads).toHaveLength(2);
  expect(host.events).toEqual(['open', 'proof', 'close', 'open', 'proof', 'close']);
  for (const options of host.reads) expect(options).toMatchObject({ nodeId: 'conflict',
    desktopLabel: 'windows', peerFragment: 'Desktop fork macos', expectedContent: WINDOWS_BODY });
  const receipt = JSON.parse(fs.readFileSync(path.join(host.root, 'two-device-sync-provider-receipt.json')));
  expect(receipt.conflict).toEqual(proof());
});

it('rejects a changed fork version after restart even when the node count is unchanged', async () => {
  await expect(runProvider(true)).rejects.toThrow('fork');
});

it('creates and accepts one equal Device through fixed Windows product commands', () => {
  const source = fs.readFileSync('scripts/windows/windows-two-device-sync-provider-action.mjs', 'utf8');
  expect(source).toContain("'create_sync_group'");
  expect(source).toContain("'accept_sync_group_join_request'");
  expect(source).toContain("JSON.stringify(request).includes('workgroup_key')");
  expect(source).toContain('Windows anchor incorrectly ran member synchronization.');
  expect(source).toContain('anchorDoesNotPollMembers: true');
  expect(source).toContain("waitForWindowsSyncGroupProviderRelease({ action: ACTION");
  expect(source).toContain("report(options.reportProgress, 'conflict-sync-resumed')");
  expect(source).not.toContain("'discover_sync_groups'");
  expect(source).toContain("'onSyncGroupJoinRequestsChanged' : 'onSyncGroupDiscoveryChanged'");
  expect(source).not.toMatch(/while \(Date\.now\(\) < deadline\)/u);
  expect(source).toContain("['A', 'B'], { B: 2 }");
  expect(source).toContain("loadConvergedDesktopSyncForks({ desktopLabel: 'windows'");
  expect(source).not.toContain("kind: 'sync-conflict-count'");
  expect(source).not.toMatch(/manager|pairing|authorization|DELETE FROM|UPDATE sync_/u);
});
