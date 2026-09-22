import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { createFakeCapacitorConnection, installCompanionNodeSchema } from '../../companionSyncNodeVersionsTestSupport';
import { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

import type { CompanionContentEdit } from './companionContentEditContract';
import { readCompanionContentSource, saveCompanionContentEdit } from './companionContentEditing';

const state = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null, platform: 'ios' }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => state.platform, isNativePlatform: () => true
}, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));

let database: Database.Database;
let directory: string;
const baseline = 'Apples\nBread\nMilk\n';
const now = '2026-09-20T00:00:00.000Z';

function node(overrides: Partial<WorkspaceNodeSnapshot> = {}): WorkspaceNodeSnapshot {
  return { id: 'topic', content: baseline, kind: 'topic', title: 'Shopping', isTitleManual: true,
    hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: now, updatedAt: now, ...overrides };
}

async function insert(value: WorkspaceNodeSnapshot, versionId: string) {
  const record = await toWorkspaceNativeNodeVersion(value, 'remote', versionId);
  await state.owner!.runWriter((db) => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
}

function edit(content: string, versionId = 'local', baseVersionId = 'base'): CompanionContentEdit {
  return { nodeId: 'topic', content, versionId, baseVersionId, updatedAt: '2026-09-20T01:00:00.000Z' };
}

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'foliole-content-edit-'));
  database = new Database(path.join(directory, 'companion.db'));
  database.transaction(() => {
    installCompanionNodeSchema(database);
    database.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)').run('device_id', 'test-mobile', now);
  })();
  const connection = { ...createFakeCapacitorConnection(database),
    getUrl: async () => ({ url: path.join(directory, 'companion.db') }) };
  const manager = {
    closeConnection: async () => undefined, createConnection: async () => connection,
    isConnection: async () => ({ result: true }), isDatabase: async () => ({ result: true }),
    retrieveConnection: async () => connection
  };
  state.owner = new CapacitorCompanionDatabaseOwner(manager as never, 'ios');
  await state.owner.open({ expectedHostName: 'mobile', now });
  await insert(node(), 'base');
});

afterEach(async () => {
  await state.owner?.close();
  state.owner = null;
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

it.each(['android', 'ios'])('%s merges the real input base and persists the next input branch across reopen', async (platform) => {
  state.platform = platform;
  await insert(node({ content: 'Apples\nBread\nMilk coffee\n', currentVersionId: 'base' }), 'remote');
  const first = await saveCompanionContentEdit(edit('Apples tea\nBread\nMilk\n'));
  expect(first.content).toBe('Apples tea\nBread\nMilk coffee\n');
  await saveCompanionContentEdit(edit('Apples tea\nBread jam\nMilk\n', 'local-2', first.submittedVersionId));
  await state.owner!.close();
  database.close();
  database = new Database(path.join(directory, 'companion.db'));
  expect(database.prepare('SELECT content FROM nodes WHERE id = ?').get('topic')).toEqual({
    content: 'Apples tea\nBread jam\nMilk coffee\n'
  });
});

it('replays an uncertain acknowledgement without creating another input version', async () => {
  const request = edit('Apples tea\nBread\nMilk\n');
  const first = await saveCompanionContentEdit(request);
  const replay = await saveCompanionContentEdit(request);
  expect(replay).toEqual(first);
  expect(database.prepare('SELECT COUNT(*) AS n FROM node_sync_versions WHERE object_id = ?').get('topic')).toEqual({ n: 2 });
  await expect(saveCompanionContentEdit({ ...request, content: 'Different input' })).rejects.toThrow('content_edit_version_mismatch');
});

it('retains overlapping input as current content or an existing text alternative', async () => {
  await insert(node({ content: 'Apples coffee\nBread\nMilk\n', currentVersionId: 'base' }), 'remote');
  const saved = await saveCompanionContentEdit(edit('Apples tea\nBread\nMilk\n'));
  const rows = database.prepare('SELECT body_text FROM node_text_alternatives').all() as { body_text: string }[];
  expect([saved.content, ...rows.map((row) => row.body_text)]).toEqual(expect.arrayContaining([
    'Apples coffee\nBread\nMilk\n', 'Apples tea\nBread\nMilk\n'
  ]));
});

it('remaps child anchors and rolls back the entire edit if a child cannot be versioned', async () => {
  await insert(node({ id: 'child', kind: 'item', parentNodeId: 'topic', content: 'Note',
    anchorLink: { id: 'anchor', kind: 'highlight', locator: { from: 7, to: 12, originalText: 'Bread' } } }), 'child-base');
  await saveCompanionContentEdit(edit('Apples tea\nBread\nMilk\n'));
  const row = database.prepare('SELECT anchor_link, current_version_id FROM nodes WHERE id = ?').get('child') as {
    anchor_link: string; current_version_id: string;
  };
  expect(JSON.parse(row.anchor_link).locator).toMatchObject({ from: 11, to: 16, originalText: 'Bread' });
  expect(row.current_version_id).not.toBe('child-base');
  database.prepare('UPDATE nodes SET current_version_id = NULL WHERE id = ?').run('child');
  const before = await readCompanionContentSource('topic');
  await expect(saveCompanionContentEdit(edit('Prefix\n' + before.content, 'fail', before.versionId))).rejects.toThrow('synced child base');
  expect(await readCompanionContentSource('topic')).toEqual(before);
});

it('preserves image excerpt regions while moving the parent image anchor', async () => {
  const image = '![Cover](asset://hash-1.png)';
  await saveCompanionContentEdit(edit(image));
  const imageRegions = [{ attachmentId: 'hash-1',
    regions: [{ height: 0.2, id: 'region-1', width: 0.3, x: 0.1, y: 0.4 }] }];
  await insert(node({ id: 'image-child', parentNodeId: 'topic', content: 'Image excerpt', imageRegions,
    anchorLink: { id: 'excerpt', kind: 'image-excerpt', locator: { from: 0, to: image.length, originalText: image } }
  }), 'image-base');
  await saveCompanionContentEdit(edit('Lead\n' + image, 'image-edit', 'local'));
  const row = database.prepare('SELECT anchor_link, image_regions FROM nodes WHERE id = ?').get('image-child') as {
    anchor_link: string; image_regions: string;
  };
  expect(JSON.parse(row.anchor_link).locator.from).toBe(5);
  expect(JSON.parse(row.image_regions)).toEqual(imageRegions);
});

it('rejects an input whose parent was moved to trash before the writer ran', async () => {
  await insert(node({ id: 'folder', kind: 'folder', content: '' }), 'folder-base');
  database.prepare('UPDATE nodes SET parent_id = ? WHERE id = ?').run('folder', 'topic');
  database.prepare('UPDATE nodes SET deleted_at = ? WHERE id = ?').run(now, 'folder');
  await expect(saveCompanionContentEdit(edit('Protected draft'))).rejects.toThrow('cannot be edited');
  expect(database.prepare('SELECT content FROM nodes WHERE id = ?').get('topic')).toEqual({ content: baseline });
});


it('opens editable content promptly with ten thousand visible topics', async () => {
  const add = database.prepare(`INSERT INTO nodes
    (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES (?, ?, 'topic', 'Capacity topic', '', ?, ?)`);
  database.transaction(() => {
    for (let index = 0; index < 9999; index += 1) {
      add.run(`capacity-${index}`, index < 100 ? null : `capacity-${index % 100}`, now, now);
    }
  })();
  const started = performance.now();
  expect(await readCompanionContentSource('topic')).toEqual({ content: baseline, versionId: 'base' });
  expect(performance.now() - started).toBeLessThan(1000);
}, 15000);

it('rejects reading editable content below a trashed ancestor', async () => {
  await insert(node({ id: 'folder', kind: 'folder', content: '' }), 'folder-base');
  database.prepare('UPDATE nodes SET parent_id = ? WHERE id = ?').run('folder', 'topic');
  database.prepare('UPDATE nodes SET deleted_at = ? WHERE id = ?').run(now, 'folder');
  await expect(readCompanionContentSource('topic')).rejects.toThrow('cannot be edited');
});
