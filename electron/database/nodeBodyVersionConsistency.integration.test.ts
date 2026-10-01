// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import {
  assertPersisted, closeLibraries, createPeer, edit, joinPeers, startLibraries, sync
} from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const NOW = '2026-10-01T01:00:00.000Z';

it('publishes a body writer change after reopening and preserves a confirmed peer base', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const first = edit(source, 'Original body.');
  await sync(source, target);
  const old = source.db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(first);
  source.driver.transaction((driver) => writeNodeBody({
    driver, nodeId: 'topic', title: 'Topic', content: 'Changed 正文.\r\n', updatedAt: NOW
  }));

  const reopened = new Database(source.file);
  let next: string | null;
  try {
    next = flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(reopened), 'topic', source.name, NOW);
  } finally { reopened.close(); }
  expect(next).not.toBeNull();
  expect(next).not.toBe(first);
  expect((await loadCurrentSyncNodeRecord(source.port, 'topic'))?.body_text).toBe('Changed 正文.\r\n');
  expect(source.db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(first)).toEqual(old);
  await sync(source, target);
  assertPersisted(source, 'Changed 正文.\r\n', next!);
  assertPersisted(target, 'Changed 正文.\r\n', next!);
});

it('publishes both the changed parent body and remapped child anchor through version refresh', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'Prefix. Target sentence.');
  source.driver.transaction((driver) => {
    upsertNodeSnapshot(driver, {
      nodeId: 'child', parentNodeId: 'topic', kind: 'item', title: 'Highlight', content: 'Target sentence.',
      anchorLink: { id: 'anchor', kind: 'highlight', locator: {
        from: 8, to: 24, originalText: 'Target sentence.'
      } }, createdAt: NOW, updatedAt: NOW, hostName: source.name,
      isTitleManual: true, position: null, reveal: null
    });
    flushNodeSyncVersionWithDriver(driver, 'child', source.name, NOW);
  });
  await sync(source, target);
  const before = await loadCurrentSyncNodeRecord(source.port, 'child');
  const change = source.driver.transaction((driver) => applyParentContentChange({
    driver, nodeId: 'topic', nextContent: 'Longer prefix. Target sentence.', updatedAt: NOW
  }));
  expect(change.affectedChildIds).toEqual(['child']);
  const parentVersion = flushNodeSyncVersionWithDriver(source.driver, 'topic', source.name, NOW);
  const childVersion = flushNodeSyncVersionWithDriver(source.driver, 'child', source.name, NOW);
  expect(parentVersion).not.toBeNull();
  expect(childVersion).not.toBeNull();
  expect(childVersion).not.toBe(before?.version_id);
  await sync(source, target);
  assertPersisted(source, 'Longer prefix. Target sentence.', parentVersion!);
  assertPersisted(target, 'Longer prefix. Target sentence.', parentVersion!);
  const child = await loadCurrentSyncNodeRecord(target.port, 'child');
  expect(child?.version_id).toBe(childVersion);
  expect(JSON.parse(child!.snapshot.anchor_link!).locator.from).toBe(15);
  expect(target.db.prepare('SELECT anchor_link FROM nodes WHERE id = ?').pluck().get('child'))
    .toBe(child?.snapshot.anchor_link);
});

it('keeps a clean matching body on the same version and preserves legal empty text', async () => {
  const source = createPeer('source');
  const first = edit(source, 'Same body.');
  writeNodeBody({ driver: source.driver, nodeId: 'topic', title: 'Topic', content: 'Same body.', updatedAt: NOW });
  expect(flushNodeSyncVersionWithDriver(source.driver, 'topic', source.name, NOW)).toBeNull();
  expect((await loadCurrentSyncNodeRecord(source.port, 'topic'))?.version_id).toBe(first);
  writeNodeBody({ driver: source.driver, nodeId: 'topic', title: 'Topic', content: '', updatedAt: NOW });
  expect(flushNodeSyncVersionWithDriver(source.driver, 'topic', source.name, NOW)).not.toBeNull();
  expect((await loadCurrentSyncNodeRecord(source.port, 'topic'))?.body_text).toBe('');
  expect(loadNodeBodyResolution(source.driver, 'topic')).toMatchObject({ status: 'resolved', content: '' });
});
