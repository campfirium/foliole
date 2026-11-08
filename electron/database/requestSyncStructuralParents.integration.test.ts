// @vitest-environment node
import { expect, it } from 'vitest';

import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { originals, requestNodeRound as round, restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

function record(id: string, version: string, parentId: string | null, prior?: NativeSyncNodeRecord) {
  const value = textBranch(version, `Body ${id}中文`, prior);
  return { ...value, object_id: id, snapshot: { ...value.snapshot, id, parent_id: parentId } };
}

it('carries a flat folder marker and direct references through ordinary node sync before the referenced nodes arrive', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    const marker = JSON.stringify({
      version: 1, match: 'all', conditions: [{ field: 'manual', operator: 'equals', value: 'dive-sources' }]
    });
    const refs = JSON.stringify(['later-folder', 'later-topic']);
    const draft = record('dive', 'dive-first-version', null);
    const dive: NativeSyncNodeRecord = {
      ...draft, body_text: '',
      snapshot: { ...draft.snapshot, kind: 'folder', content: '', title: 'Probability',
        virtual_filter: marker, manual_child_order: refs }
    };
    await applySyncNodesWithDbPort(source.db, [dive]);
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    target.reopen();
    expect(target.sqlite.prepare(`SELECT kind, parent_id, title, virtual_filter, manual_child_order
      FROM nodes WHERE id = 'dive'`).get())
      .toEqual({ kind: 'folder', parent_id: null, title: 'Probability', virtual_filter: marker, manual_child_order: refs });
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id IN ('later-folder', 'later-topic')").all()).toEqual([]);
    const folder = record('later-folder', 'later-folder-first', null);
    await applySyncNodesWithDbPort(source.db, [
      { ...folder, body_text: '', snapshot: { ...folder.snapshot, kind: 'folder', content: '' } },
      record('later-topic', 'later-topic-first', 'later-folder')
    ]);
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    expect(target.sqlite.prepare("SELECT manual_child_order FROM nodes WHERE id = 'dive'").pluck().get()).toBe(refs);
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id IN ('later-folder', 'later-topic') ORDER BY id").pluck().all())
      .toEqual(['later-folder', 'later-topic']);
  } finally { await fixture.close(); }
});

it('moves an existing child beneath a new parent through normal request dependency recovery', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const initial = record('a-child', 'child-original', null);
    for (const peer of [source, target]) await applySyncNodesWithDbPort(peer.db, [initial]);
    const parent = record('z-parent', 'parent-original', null);
    const moved = record('a-child', 'child-moved', parent.object_id, initial);
    await applySyncNodesWithDbPort(source.db, [parent, moved]);
    // The real round starts after production convergence has retired unused topic ancestors.
    expect(await collectNodeVersionPayloads(source.db, 'a-child')).toEqual({ released: 1, skipped: null });
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    target.reopen();
    expect(target.sqlite.prepare("SELECT parent_id, content, current_version_id FROM nodes WHERE id = 'a-child'").get())
      .toEqual({ parent_id: 'z-parent', content: initial.body_text, current_version_id: moved.version_id });
    expect(target.sqlite.prepare("SELECT version_id, parent_version_id FROM node_sync_versions WHERE object_id = 'a-child' ORDER BY version_id").all())
      .toEqual([{ version_id: 'child-moved', parent_version_id: 'child-original' },
        { version_id: 'child-original', parent_version_id: null }]);
    expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { await fixture.close(); }
});

it('applies an independent child without overwriting an existing acyclic ancestor projection', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (const peer of [source, target]) peer.sqlite.exec(`INSERT INTO nodes
      (id, kind, title, created_at, updated_at) VALUES ('special-inbox', 'folder', 'Inbox', 'now', 'now')`);
    target.sqlite.exec(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
      VALUES ('other-parent', 'folder', 'Other', 'now', 'now');
      UPDATE nodes SET parent_id = 'other-parent' WHERE id = 'special-inbox'`);
    const child = record('child', 'child-original', 'special-inbox');
    await applySyncNodesWithDbPort(source.db, [child]);
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    target.reopen();
    expect(target.sqlite.prepare("SELECT parent_id, content, current_version_id FROM nodes WHERE id = 'child'").get())
      .toEqual({ parent_id: 'special-inbox', content: child.body_text, current_version_id: child.version_id });
    expect(target.sqlite.prepare("SELECT parent_id FROM nodes WHERE id = 'special-inbox'").pluck().get()).toBe('other-parent');
    expect(target.sqlite.prepare('SELECT version_id, content_hash, body_text FROM node_sync_versions').all())
      .toEqual(source.sqlite.prepare('SELECT version_id, content_hash, body_text FROM node_sync_versions').all());
  } finally { await fixture.close(); }
});

it.each([false, true])('rejects a structural parent cycle without receiver changes, existing path=%s', async existing => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const a = record('a-parent', 'a-base', null);
    const b = record('b-child', 'b-base', a.object_id);
    await applySyncNodesWithDbPort(source.db, [a, b]);
    if (existing) await applySyncNodesWithDbPort(target.db, [a, b]);
    const moved = record('a-parent', 'a-cycle', b.object_id, a);
    await applySyncNodesWithDbPort(source.db, [moved]);
    const before = originals(target);
    await expect(round(source, target)).rejects.toThrow(/parent_cycle/);
    expect(originals(target)).toEqual(before);
    target.reopen();
    expect(originals(target)).toEqual(before);
    expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { await fixture.close(); }
});


it('rejects a new node whose structural parent is itself before retaining facts', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await applySyncNodesWithDbPort(source.db, [record('self-parent', 'self-version', null)]);
    source.sqlite.exec(`UPDATE nodes SET parent_id = id WHERE id = 'self-parent';
      UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.parent_id', 'self-parent')
      WHERE object_id = 'self-parent'`);
    const before = originals(target);
    await expect(round(source, target)).rejects.toThrow('framed_sync_node_parent_cycle');
    expect(originals(target)).toEqual(before);
    target.reopen();
    expect(originals(target)).toEqual(before);
  } finally { await fixture.close(); }
});


it('defers a structural cycle while retaining an independent object through reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const parent = record('a-parent', 'a-base', null);
    const child = record('b-child', 'b-base', parent.object_id);
    for (const peer of [source, target]) await applySyncNodesWithDbPort(peer.db, [parent, child]);
    const before = originals(target);
    const cycle = record('a-parent', 'a-cycle', child.object_id, parent);
    const healthy = record('z-healthy', 'healthy-version', null);
    await applySyncNodesWithDbPort(source.db, [cycle, healthy]);
    const errors: string[] = [];
    expect(await round(source, target, errors)).toMatchObject({ complete: false });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every(error => error === 'framed_sync_node_parent_cycle')).toBe(true);
    target.reopen();
    expect(target.sqlite.prepare("SELECT content, current_version_id FROM nodes WHERE id = 'z-healthy'").get())
      .toEqual({ content: healthy.body_text, current_version_id: healthy.version_id });
    const after = originals(target);
    expect(after[0]!.filter(node => (node as { id: string }).id !== healthy.object_id)).toEqual(before[0]);
    expect(after[1]!.filter(version => (version as { object_id: string }).object_id !== healthy.object_id)).toEqual(before[1]);
    expect(after[2]).toEqual(before[2]);
    expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { await fixture.close(); }
});
