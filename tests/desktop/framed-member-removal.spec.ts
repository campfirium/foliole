import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const nodeId = 'native-member-removal-original';
const originalBody = '\ufeffOriginal 中文😀\0\r\n';
const currentBody = '\ufeffCurrent 中文😀\0\r\n';

function readRemovalState(_electron: unknown, input: { nodeId: string; peerId: string; groupId: string }) {
  const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
  const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
  const membership = require(`${process.cwd()}/dist/electron/database/syncGroupMemberStateStore.js`);
  return connection.runWithDatabaseConnectionOwner(() => {
    const driver = connection.openDatabaseConnection().driver;
    return {
      nodes: driver.queryAll('SELECT id, content, current_version_id FROM nodes WHERE id = ?', [input.nodeId]),
      versions: driver.queryAll('SELECT * FROM node_sync_versions WHERE object_id = ? ORDER BY version_id', [input.nodeId]),
      parents: driver.queryAll(`SELECT p.* FROM node_sync_version_parents p JOIN node_sync_versions v
        ON v.version_id = p.version_id WHERE v.object_id = ? ORDER BY p.version_id, p.ordinal`, [input.nodeId]),
      member: driver.queryOne('SELECT state, left_at FROM sync_group_devices WHERE device_identity_key = ?', [input.peerId]),
      blocked: membership.isDesktopSyncGroupDeviceBlocked(input.groupId, input.peerId),
      removals: driver.queryAll('SELECT target_device_identity_key, completed_at FROM sync_group_removal_decisions WHERE group_id = ?', [input.groupId])
    };
  });
}

test('removes an offline member through the native command while preserving original bodies and version history', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const identity = await desktopApp.evaluate(async (_electron, input) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const path = process.getBuiltinModule('path')!;
    const load = (file: string) => require(path.join(process.cwd(), 'dist', file));
    const connection = load('electron/database/connection.js');
    return connection.runWithDatabaseConnectionOwner(() => {
      const groups = load('electron/database/syncGroupStore.js');
      const identity = load('lib/platform/syncGroupUnifiedContract.js');
      const groupId = 'framed-native-removal';
      const local = identity.createSyncGroupDeviceIdentity({
        device_anchor: '11111111-1111-4111-8111-111111111111', group_id: groupId,
        library_path: connection.openDatabaseConnection().dbPath, path_flavor: 'posix' });
      const remote = identity.createSyncGroupDeviceIdentity({
        device_anchor: '22222222-2222-4222-8222-222222222222', group_id: groupId,
        library_path: '/isolated-peer/foliole.db', path_flavor: 'posix' });
      groups.createDesktopSyncGroup({ device: local, deviceName: 'Isolated Mac', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: remote, deviceName: 'Offline peer', platform: 'darwin' });
      const mutations = load('electron/database/nodeMutations.js');
      const versions = load('electron/database/nodeSyncVersionFromDriver.js');
      const driver = connection.openDatabaseConnection().driver;
      const versionIds = [input.originalBody, input.currentBody].map((content, index) => {
        const now = `2026-10-14T00:00:0${index}.000Z`;
        mutations.upsertNodeSnapshot({ nodeId: input.nodeId, kind: 'topic', title: 'Original member removal facts',
          content, parentNodeId: null, anchorLink: null, position: null, reveal: null,
          isTitleManual: true, createdAt: '2026-10-14T00:00:00.000Z', updatedAt: now });
        return versions.flushNodeSyncVersionWithDriver(driver, input.nodeId, 'Isolated Mac', now);
      });
      return { groupId, peerId: remote.identity_key, versionIds };
    });
  }, { nodeId, originalBody, currentBody });
  const key = { groupId: identity.groupId, peerId: identity.peerId, nodeId };
  const before = await desktopApp.evaluate(readRemovalState, key);
  expect(before.member).toEqual({ state: 'active', left_at: null });
  expect(before.blocked).toBe(false);
  expect(before.versions).toHaveLength(2);
  expect(before.versions).toEqual(expect.arrayContaining([
    expect.objectContaining({ version_id: identity.versionIds[0], body_text: originalBody }),
    expect.objectContaining({ version_id: identity.versionIds[1], body_text: currentBody })
  ]));
  expect(before.parents).toEqual([{ version_id: identity.versionIds[1], parent_version_id: identity.versionIds[0], ordinal: 0 }]);
  expect(before.nodes).toEqual([{ id: nodeId, content: currentBody, current_version_id: identity.versionIds[1] }]);
  await desktopWindow.evaluate((deviceId) => window.electronAPI.invoke(
    'remove_sync_group_device', { device_identity_key: deviceId }), identity.peerId);
  const after = await desktopApp.evaluate(readRemovalState, key);
  expect(after.member).toEqual({ state: 'left', left_at: expect.any(String) });
  expect(after.blocked).toBe(true);
  expect(after.removals).toEqual([{ target_device_identity_key: identity.peerId, completed_at: expect.any(String) }]);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.versions).toEqual(before.versions);
  expect(after.parents).toEqual(before.parents);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  expect(await desktopApp.evaluate(readRemovalState, key)).toEqual(after);
});
