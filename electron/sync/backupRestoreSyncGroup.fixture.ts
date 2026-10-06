import { promises as fs } from 'node:fs';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { createSyncGroupDeviceIdentity, devicePathFlavorFromCanonicalLibraryPath,
  type SyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from '../database/backupRestore.js';
import { loadBackupRestorePendingSync, saveBackupRestorePendingSync } from '../database/backupRestorePendingSync.js';
import { inspectBackupRestoreSync } from '../database/backupRestoreSyncPreview.js';
import { finishLocalOnlyBackupRestore } from '../database/backupRestoreSyncSelection.js';
import { loadBackupSettings, resolveManagedBackupDirectory } from '../database/backupSettings.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { captureBackupRestoreHostSettings } from '../database/syncGroupBackupRestore.js';
import { loadDesktopSyncGroupRestoreState } from '../database/syncGroupRestoreState.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadDesktopDeviceIdentity } from '../deviceAnchorStore.js';
import { handleSyncGroupCommand } from '../ipc/syncGroupCommands.js';

import { appendRestoreFacts, deletePausedNode, restoreFactsSnapshot, safetySnapshotFacts } from './backupRestoreSyncGroup.facts.fixture.js';
import { resumeDesktopCompanionSync, enableDesktopCompanionSync } from './desktopCompanionSyncParticipation.js';
import { loadDesktopCompanionSyncParticipation } from './desktopCompanionSyncPreference.js';
import { runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import { saveDesktopSyncGroupCandidates } from './desktopSyncGroupJoinState.js';
import { exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';
import { downloadAndApplyDesktopSyncGroupPack } from './desktopSyncGroupPackApply.js';
import { drainDesktopSyncGroupResourceArticles } from './desktopSyncGroupResourceArticleDrain.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';
import { createWorkspaceSyncHttpServer, stopLanWorkspaceSyncServer } from './lanWorkspaceSyncServer.js';
import { runResourceConcurrencyFixture } from './resourceAvailabilityConcurrency.fixture.js';

let server: ReturnType<typeof createWorkspaceSyncHttpServer> | null = null;
let origin = '';
async function initializeGroup(args: Record<string, unknown>) {
  initializeDatabase();
  const groupId = String(args.groupId);
  const { identity } = await loadDesktopDeviceIdentity({ groupId, libraryPath: openDatabaseConnection().dbPath });
  createDesktopSyncGroup({ device: identity, deviceName: String(args.name), platform: 'darwin',
    workgroupKey: Buffer.alloc(32, 7).toString('base64url') });
  if (!server) {
    server = createWorkspaceSyncHttpServer({ appVersion: '0.7.14', deviceId: identity.identity_key });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address missing');
    origin = `http://127.0.0.1:${address.port}`;
  }
  return { origin, identity: identity.identity_key, database: openDatabaseConnection().dbPath, device: identity, backupDirectory: resolveManagedBackupDirectory(loadBackupSettings()) };
}
function seed(args: Record<string, unknown>) {
  const body = args.id ? String(args.content) : `${String(args.content)}\n![Restore image](asset://9fb389cdb800b9b838af19935ce1615574a0e4d43f7c9b2786560ee9dba67322.png)`;
  upsertNodeSnapshot({ nodeId: String(args.id ?? 'topic'), kind: 'topic', title: String(args.content),
    content: body, parentNodeId: null, position: 0, anchorLink: null, reveal: null,
    isTitleManual: true, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: new Date().toISOString() });
  flushDirtyNodeSyncVersions();
}
async function pull(args: Record<string, unknown>) {
  const group = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroup()!);
  const peer = { endpoint_url: String(args.origin), group_id: group.group_id,
    local_device_id: group.local_device_identity_key, peer_device_id: String(args.identity),
    peer_device_name: String(args.name), peer_platform: 'darwin' };
  const exchanged = await exchangeDesktopSyncGroupMemberState(peer);
  if (!exchanged.restoreFromPeer) return exchanged;
  // Send the learned restore event back before the source authorizes restore pages.
  await exchangeDesktopSyncGroupMemberState(peer);
  const progress = openDatabaseConnection().driver.queryOne<{
    cursor_state_seq: number; frontier_state_seq: number; source_epoch: string
  }>('SELECT cursor_state_seq, frontier_state_seq, source_epoch FROM sync_pack_receive_progress WHERE group_id = ? AND peer_id = ? AND restore_id = ?',
    [group.group_id, peer.peer_device_id, exchanged.restoreFromPeer]);
  let after = progress?.cursor_state_seq ?? 0;
  let frontier = progress?.frontier_state_seq;
  let epoch = progress?.source_epoch;
  for (let page = 0; page < 100; page++) {
    const result = await downloadAndApplyDesktopSyncGroupPack({ after, peer,
      ...(frontier === undefined ? {} : { frontierStateSeq: frontier }),
      ...(epoch ? { sourceEpoch: epoch } : {}),
      restoreId: exchanged.restoreFromPeer, createHeaders: createDesktopSyncGroupSignedHeaders });
    after = result.cursor;
    frontier = result.frontierStateSeq;
    epoch = result.sourceEpoch;
    if (args.firstPage && after < result.frontierStateSeq) return { applied: false, cursor: after, frontier: result.frontierStateSeq };
    if (after === result.frontierStateSeq) {
      await exchangeDesktopSyncGroupMemberState(peer);
      await drainDesktopSyncGroupResourceArticles(peer);
      return { applied: true, restoreId: exchanged.restoreFromPeer };
    }
  }
  throw new Error('test restore did not converge');
}
function snapshot() {
  const driver = openDatabaseConnection().driver;
  return { pending: loadBackupRestorePendingSync(), participation: loadDesktopCompanionSyncParticipation(),
    group: loadDesktopSyncGroup()?.group_id, library: loadWorkspaceSnapshot({ includeBody: true })!,
    versions: driver.queryAll('SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id'),
    restore: loadDesktopSyncGroup() ? loadDesktopSyncGroupRestoreState(driver, loadDesktopSyncGroup()!.group_id) : null };
}
async function runJoinFixture(action: string, args: Record<string, unknown>) {
  if (action === 'initLocal') {
    initializeDatabase();
    const driver = openDatabaseConnection().driver;
    finishLocalOnlyBackupRestore(driver, captureBackupRestoreHostSettings(driver));
    if (args.enabled) await enableDesktopCompanionSync({ appVersion: '0.7.14', deviceId: 'unavailable' });
    return snapshot();
  }
  if (action === 'pendingRestore') {
    saveBackupRestorePendingSync(openDatabaseConnection().driver, args.pending ? {
      groupId: String(args.groupId), restoreId: 'restore-pending', restoredAt: new Date().toISOString()
    } : null);
    return snapshot();
  }
  if (action === 'joinRequest') {
    const discovery = await fetch(`${String(args.origin)}/companion/discovery`).then((response) => response.json());
    saveDesktopSyncGroupCandidates([{ ...discovery, endpoint_url: String(args.origin) }]);
    return handleSyncGroupCommand(NATIVE_COMMANDS.requestSyncGroupJoin, { endpoint_url: args.origin, mode: args.mode ?? 'merge' });
  }
  if (action === 'joinAccept' || action === 'joinReject') {
    return handleSyncGroupCommand(action === 'joinAccept' ? NATIVE_COMMANDS.acceptSyncGroupJoinRequest :
      NATIVE_COMMANDS.rejectSyncGroupJoinRequest, { request_id: args.requestId });
  }
  if (action === 'joinComplete') return handleSyncGroupCommand(NATIVE_COMMANDS.completeSyncGroupJoin, {});
  if (action === 'joinProviderEnable') return handleSyncGroupCommand(NATIVE_COMMANDS.enableCompanionSync, {});
  if (action === 'joinOverview') return handleSyncGroupCommand(NATIVE_COMMANDS.loadSyncGroupOverview, {});
  throw new Error('unknown join fixture action');
}

async function run(action: string, args: Record<string, unknown>) {
  if (['initLocal', 'pendingRestore', 'joinRequest', 'joinAccept', 'joinReject', 'joinComplete',
    'joinProviderEnable', 'joinOverview'].includes(action)) {
    return runJoinFixture(action, args);
  }
  if (action === 'init') return initializeGroup(args);
  if (action === 'register') {
    for (const member of args.members as Array<{ device: SyncGroupDeviceIdentity; name: string }>) {
      registerSyncGroupDevice({ device: createSyncGroupDeviceIdentity({ device_anchor: member.device.device_anchor,
        group_id: member.device.group_id, library_path: member.device.canonical_library_path,
        path_flavor: devicePathFlavorFromCanonicalLibraryPath(member.device.canonical_library_path) }),
        deviceName: member.name, platform: 'darwin' });
    }
    return null;
  }
  if (action === 'seed') return runWithDatabaseConnectionOwner(() => seed(args));
  if (action === 'batch') {
    for (let index = 0; index < 40; index++) seed({ id: `batch-${index}`, content: `Batch ${index}` });
    return null;
  }
  if (action === 'facts') return appendRestoreFacts();
  if (action === 'delete') return deletePausedNode();
  if (action === 'readFacts') return restoreFactsSnapshot();
  if (action === 'proofs') return openDatabaseConnection().driver.queryAll(
    `SELECT device_identity_key, library_epoch, proof_revision
     FROM node_version_device_revisions ORDER BY device_identity_key`
  );
  if (action === 'safety') return safetySnapshotFacts();
  if (action === 'backup') return createApplicationDatabaseBackup();
  if (action === 'leave') return handleSyncGroupCommand(NATIVE_COMMANDS.leaveSyncGroup, {});
  if (action === 'restoreLocal') {
    const preview = await inspectBackupRestoreSync(String(args.file));
    return restoreApplicationDatabaseBackup({ sourcePath: String(args.file),
      choice: { source: 'current', action: 'local', revision: preview.revision } });
  }
  if (action === 'sync') {
    const group = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroup()!);
    return runDesktopSyncCoordinator('manual', { endpoint_url: String(args.origin),
      group_id: group.group_id, local_device_id: group.local_device_identity_key,
      peer_device_id: String(args.identity), peer_device_name: 'Peer', peer_platform: 'darwin' });
  }
  if (action === 'restore') {
    const preview = await inspectBackupRestoreSync(String(args.file));
    return restoreApplicationDatabaseBackup({ sourcePath: String(args.file),
      choice: { source: 'current', action: args.pause ? 'pause' : 'overwrite', revision: preview.revision } });
  }
  if (action === 'resume') return resumeDesktopCompanionSync({ appVersion: '0.7.14',
    deviceId: loadDesktopSyncGroup()!.local_device_identity_key }, args.confirm ? loadBackupRestorePendingSync()?.restoreId : undefined);
  if (action === 'enable') return enableDesktopCompanionSync({ appVersion: '0.7.14',
    deviceId: loadDesktopSyncGroup()!.local_device_identity_key });
  if (action === 'pull') return pull(args);
  if (action === 'snapshot') return runWithDatabaseConnectionOwner(snapshot);
  if (action === 'reopen') {
    await stopLanWorkspaceSyncServer();
    closeDatabaseConnection(); initializeDatabase(); return snapshot();
  }
  if (action === 'close') {
    await stopLanWorkspaceSyncServer();
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    closeDatabaseConnection();
    return null;
  }
  throw new Error('unknown test action');
}
process.on('message', (message: { id: number; action: string; args: Record<string, unknown> }) => {
  const handler = message.action.startsWith('resource') ? runResourceConcurrencyFixture : run;
  void handler(message.action, message.args).then(
    (result) => process.send?.({ id: message.id, result }),
    (error: unknown) => process.send?.({ id: message.id, error: error instanceof Error ? `${message.action}: ${error.stack}` : String(error) })
  );
});
void fs.mkdir(process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT!, { recursive: true });

export type FixtureReply = ReturnType<typeof snapshot> & Awaited<ReturnType<typeof initializeGroup>> &
  Awaited<ReturnType<typeof createApplicationDatabaseBackup>> & Awaited<ReturnType<typeof restoreFactsSnapshot>> & { applied: boolean; cursor: number; frontier: number };
