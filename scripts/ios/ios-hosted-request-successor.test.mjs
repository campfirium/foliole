// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath(name) { if (!sandbox.root) throw new Error('fixture_not_initialized'); return path.join(sandbox.root, name); },
  isPackaged: false
} }));

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance, runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { migrateDesktopHostProfile } from '../../electron/database/hostProfile.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion.js';
import { buildWorkspaceSnapshotNode } from '../../lib/core/database/workspaceSnapshotHelpers.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { createIosHostedRequestLibrary } from './ios-hosted-request-library.ts';
import { seedIosHostedRequestLibrary } from './ios-hosted-request-seed.ts';
import { advanceIosHostedRequestSuccessor, IOS_HOSTED_SUCCESSOR_VERSION_ID } from './ios-hosted-request-successor.ts';

const captureVersion = 'ver_00000000-0000-4000-8000-000000000146';
const restoreVersion = 'ver_00000000-0000-4000-8000-000000000147';
afterEach(async () => {
  await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
  vi.unstubAllEnvs();
  if (sandbox.root) fs.rmSync(sandbox.root, { recursive: true, force: true });
  sandbox.root = '';
});

it.each(['node-random-capture-a', 'node-random-capture-b'])('continues actual capture %s only after restore arrives and keeps original history', async nodeId => {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  sandbox.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/hosted-successor-'));
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(sandbox.root, 'library'));
  await runWithDatabaseConnectionOwner(async () => {
    const connection = openDatabaseConnection();
    const { sqlite } = connection; initializeDatabaseSchema(sqlite);
    migrateDesktopHostProfile(connection, 'acceptance-desktop');
    bindParentOrderWriter(connection.driver, { deviceAnchor: 'acceptance-desktop', libraryPath: connection.dbPath });
    const library = await createIosHostedRequestLibrary({ databasePath: connection.dbPath, workgroupKey: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc' });
    await library.registerAcceptedDevice({ device_anchor: 'b1111111-1111-4111-8111-111111111111',
      canonical_library_path: '/acceptance/phone.db', path_flavor: 'posix', device_name: 'Phone', platform: 'ios-capacitor' });
    const db = createBetterSqliteDbPort(sqlite);
    await seedIosHostedRequestLibrary(db, 'legal');
    const capture = await toWorkspaceNativeNodeVersion({
      id: nodeId, parentNodeId: 'special-inbox', kind: 'topic', content: 'iOS quick capture acceptance',
      title: 'iOS quick capture acceptance', isTitleManual: false, hideTitleHeading: false,
      reveal: null, anchorLink: null, reading: null, review: null,
      createdAt: '2026-07-21T00:03:00.000Z', updatedAt: '2026-07-21T00:03:00.000Z'
    }, 'ios-acceptance-contract-peer', captureVersion);
    await applySyncNodesWithDbPort(db, [capture]);
    expect(advanceIosHostedRequestSuccessor()).toEqual({ ready: false, created: false });
    expect(sqlite.prepare('SELECT version_id FROM node_sync_versions WHERE version_id=?').get(IOS_HOSTED_SUCCESSOR_VERSION_ID)).toBeUndefined();
    const restored = buildWorkspaceSnapshotNode(sqlite.prepare("SELECT * FROM nodes WHERE id='ios-acceptance-restore'").get());
    await applySyncNodesWithDbPort(db, [await toWorkspaceNativeNodeVersion({ ...restored, deletedAt: null,
      updatedAt: '2026-07-21T00:03:30.000Z' }, 'ios-acceptance-contract-peer', restoreVersion)]);
    const before = sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    expect(before).toHaveLength(3);
    expect(advanceIosHostedRequestSuccessor()).toMatchObject({ ready: true, created: true, captureNodeId: nodeId });
    const successor = sqlite.prepare('SELECT * FROM node_sync_versions WHERE version_id=?').get(IOS_HOSTED_SUCCESSOR_VERSION_ID);
    expect(successor).toMatchObject({ object_id: nodeId, parent_version_id: captureVersion, body_text: 'Mac successor body' });
    expect(sqlite.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id=?').all(IOS_HOSTED_SUCCESSOR_VERSION_ID))
      .toEqual([{ parent_version_id: captureVersion }]);
    expect(sqlite.prepare('SELECT title,parent_id FROM nodes WHERE id=?').get(nodeId))
      .toEqual({ title: 'Mac successor acceptance', parent_id: 'special-inbox' });
    expect(sqlite.prepare('SELECT * FROM node_sync_versions WHERE version_id<>? ORDER BY version_id').all(IOS_HOSTED_SUCCESSOR_VERSION_ID)).toEqual(before);
    const after = sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    expect(advanceIosHostedRequestSuccessor()).toMatchObject({ ready: true, created: false, captureNodeId: nodeId });
    expect(sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(after);
  });
});
