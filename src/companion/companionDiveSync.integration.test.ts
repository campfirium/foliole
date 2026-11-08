// @vitest-environment node
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { addDiveSources, createDive, listDives, renameDive } from '../../electron/database/diveRepository.js';
import { requestNodeRound as round, restoreFixture } from '../../electron/database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../../electron/database/topicTextState.testSupport.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';
import { readDiveNode } from '../../lib/core/nodes/dive.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { resolveCompanionDiveSections } from './companionDiveDirectory';

function record(id: string, version: string, parentId: string | null) {
  const value = textBranch(version, `Body ${id}`);
  return { ...value, object_id: id, snapshot: { ...value.snapshot, id, parent_id: parentId } };
}

it('creates, joins and opens the same Dive after sync and receiver reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = await fixture.companionPeer('target');
  try {
    source.sqlite.exec("INSERT INTO settings VALUES ('host_name', 'source', 'now')");
    bindParentOrderWriter(createBetterSqlite3Driver(source.sqlite), { deviceAnchor: source.id, libraryPath: source.file });
    const dive = createDive(source.sqlite, 'Probability', []);
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    expect(listDives(target.sqlite)).toEqual([dive]);

    await applySyncNodesWithDbPort(source.db, [
      folderRecord('source-folder', null), folderRecord('nested', 'source-folder'),
      record('member', 'member-first', 'nested'), record('child-topic', 'child-first', 'member'),
      record('direct', 'direct-first', null), record('outside', 'outside-first', null)
    ]);
    expect(() => addDiveSources(source.sqlite, dive.id, ['direct', 'child-topic'])).toThrow('unavailable');
    expect(() => addDiveSources(source.sqlite, dive.id, [dive.id])).toThrow('unavailable');
    expect(listDives(source.sqlite)).toEqual([dive]);

    addDiveSources(source.sqlite, dive.id, ['source-folder', 'member', 'direct', 'direct']);
    const saved = renameDive(source.sqlite, dive.id, 'Statistics');
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    target.reopen();

    const desktop = loadWorkspaceListSnapshot(createBetterSqlite3Driver(source.sqlite))!;
    expect(desktop.nodeOrder).toContain(dive.id);
    expect(readDiveNode(desktop.nodesById[dive.id])).toEqual(saved);
    const mobile = await loadIosCompanionWorkspaceSnapshot(target.db);
    const sections = resolveCompanionDiveSections(mobile, { kind: 'virtual', nodeId: dive.id });
    expect(sections?.map(section => [section.id, section.items.map(item => item.nodeId)])).toEqual([
      ['diveSources', ['source-folder', 'member', 'direct']],
      ['diveTopics', ['member', 'direct']]
    ]);
    expect(target.sqlite.prepare("SELECT parent_id FROM nodes WHERE id = 'child-topic'").pluck().get()).toBe('member');
  } finally { await fixture.close(); }
});

function folderRecord(id: string, parentId: string | null): NativeSyncNodeRecord {
  const folder = record(id, `${id}-first`, parentId);
  return { ...folder, body_text: '', snapshot: { ...folder.snapshot, kind: 'folder', content: '' } };
}
