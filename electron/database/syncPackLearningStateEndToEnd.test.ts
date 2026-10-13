// @vitest-environment node

import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { reading, seedReading, sendReadingNode } from './syncPackLearningStateEndToEnd.testSupport.js';

it('receives every reading field with its node through current request replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const expected = seedReading(source, 'node-reading-1');
    for (let replay = 0; replay < 2; replay++) {
      await sendReadingNode(source, target, 'node-reading-1');
      target.reopen();
      expect(target.sqlite.prepare("SELECT title FROM nodes WHERE id = 'node-reading-1'").get())
        .toEqual({ title: 'Reading Topic' });
      expect(reading(target, 'node-reading-1')).toEqual(expected);
      expect(target.sqlite.prepare(`SELECT object_type, object_id FROM sync_object_state
        WHERE object_type = 'node_reading' AND object_id = 'node-reading-1'`).get())
        .toEqual({ object_id: 'node-reading-1', object_type: 'node_reading' });
    }
  } finally { await fixture.close(); }
});

it('retains every reading field for live children under soft-deleted parents after request bootstrap, replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    source.sqlite.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at, deleted_at)
      VALUES ('deleted-parent', 'folder', 'Deleted Parent', '', '2026-05-06T10:00:00.000Z',
        '2026-05-06T10:10:00.000Z', '2026-05-06T10:10:00.000Z')`);
    flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(source.sqlite), 'deleted-parent', 'desktop-source',
      '2026-05-06T10:10:00.000Z', 'soft-deleted-parent-version');
    expect(source.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual([]);
    const expected = seedReading(source, 'hidden-child', 'deleted-parent');
    expect(target.sqlite.prepare('SELECT * FROM nodes').all()).toEqual([]);
    for (let replay = 0; replay < 2; replay++) {
      await sendReadingNode(source, target, 'deleted-parent');
      await sendReadingNode(source, target, 'hidden-child');
      target.reopen();
      expect(target.sqlite.prepare("SELECT parent_id, deleted_at FROM nodes WHERE id = 'hidden-child'").get())
        .toEqual({ deleted_at: null, parent_id: 'deleted-parent' });
      expect(target.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id = 'deleted-parent'").get())
        .toEqual({ deleted_at: '2026-05-06T10:10:00.000Z' });
      expect(target.sqlite.prepare("SELECT node_id FROM node_reading WHERE node_id = 'hidden-child'").get())
        .toEqual({ node_id: 'hidden-child' });
      expect(reading(target, 'hidden-child')).toEqual(expected);
      expect(target.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual([]);
    }
  } finally { await fixture.close(); }
});
