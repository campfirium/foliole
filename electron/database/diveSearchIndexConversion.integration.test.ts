// @vitest-environment node
import { expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { isManualVirtualNodeFilter, parseVirtualNodeFilter, type VirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { convertDiveDirectory } from './diveConversion.js';
import { listDives } from './diveRepository.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { requestNodeRound, restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const filter: VirtualNodeFilter = {
  version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: 'Match' }]
};

it('moves the selected index once and synchronizes its fixed eligible results', async () => {
  const fixture = await restoreFixture();
  const desktop = fixture.peer('source');
  const companion = await fixture.companionPeer('target');
  try {
    const driver = createBetterSqlite3Driver(desktop.sqlite);
    desktop.sqlite.prepare("INSERT INTO settings VALUES ('host_name', ?, 'now')").run(desktop.id);
    bindParentOrderWriter(driver, { deviceAnchor: desktop.id, libraryPath: desktop.file });
    const now = new Date().toISOString();
    const seed = (nodeId: string, kind: 'topic' | 'folder', parentNodeId: string | null, virtualFilter?: VirtualNodeFilter) => {
      upsertNodeSnapshot(driver, {
        nodeId, kind, parentNodeId, title: `Match ${nodeId}`, content: '', reveal: null, anchorLink: null,
        createdAt: now, updatedAt: now, hostName: desktop.id, isTitleManual: true, position: null,
        ...(virtualFilter ? { virtualFilter } : {})
      });
      flushNodeSyncVersionWithDriver(driver, nodeId, desktop.id, now);
    };
    seed('first', 'topic', null);
    seed('second', 'topic', null);
    seed('child', 'topic', 'first');
    seed('index', 'folder', VIRTUAL_ROOT_NODE_ID, filter);
    expect(await requestNodeRound(desktop, companion)).toMatchObject({ complete: true, pending: 0 });

    const ids = ['second', 'child', 'first', 'second'];
    expect(() => convertDiveDirectory(desktop.sqlite, 'index', 'dive', { filter: '{}', ids })).toThrow('unavailable');
    expect(listDives(desktop.sqlite)).toEqual([]);
    convertDiveDirectory(desktop.sqlite, 'index', 'dive', { filter: JSON.stringify(filter), ids });
    seed('later', 'topic', null);
    expect(await requestNodeRound(desktop, companion)).toMatchObject({ complete: true, pending: 0 });
    companion.reopen();
    const dive = { id: 'index', title: 'Match index', directSourceIds: ['second', 'first'] };
    expect(listDives(desktop.sqlite)).toEqual([dive]);
    expect(listDives(companion.sqlite)).toEqual([dive]);

    convertDiveDirectory(desktop.sqlite, 'index', 'index');
    expect(await requestNodeRound(desktop, companion)).toMatchObject({ complete: true, pending: 0 });
    expect(listDives(companion.sqlite)).toEqual([]);
    const row = companion.sqlite.prepare(`SELECT id, parent_id, virtual_filter, manual_child_order
      FROM nodes WHERE title = ? AND deleted_at IS NULL`).all(dive.title) as
      { id: string; parent_id: string; virtual_filter: string; manual_child_order: string }[];
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ id: 'index', parent_id: VIRTUAL_ROOT_NODE_ID,
      manual_child_order: JSON.stringify(dive.directSourceIds) });
    expect(isManualVirtualNodeFilter(parseVirtualNodeFilter(row[0]?.virtual_filter))).toBe(true);

    seed('empty-index', 'folder', VIRTUAL_ROOT_NODE_ID, filter);
    convertDiveDirectory(desktop.sqlite, 'empty-index', 'dive', { filter: JSON.stringify(filter), ids: [] });
    expect(listDives(desktop.sqlite)).toEqual([{ id: 'empty-index', title: 'Match empty-index', directSourceIds: [] }]);
  } finally { await fixture.close(); }
});
