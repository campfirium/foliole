// @vitest-environment node
import { expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';

import { deletePermanently, groupRound, nodeTraces, withDb, withFixture } from './syncHistoryHorizon.testSupport.js';

it('converges over HTTP when an offline device creates a note under a permanently deleted folder', async () => {
  await withFixture(async fixture => {
    const { left, right, leftSnapshot, rightSnapshot } = fixture;
    const folder = 'deleted-folder';
    const child = 'offline-child';
    const body = 'Written while offline';
    const liveFolder = 'live-folder';
    const movedIn = { nodeId: 'offline-moved-in', title: 'Moved in', content: 'Existing note' };
    const movedOut = { nodeId: 'offline-moved-out', title: 'Moved out', content: 'Outside note' };
    await left.seed({ nodeId: folder, kind: 'folder', title: 'Deleted folder', content: '' });
    await left.seed({ nodeId: liveFolder, kind: 'folder', title: 'Live folder', content: '' });
    await left.seed({ ...movedIn, parentNodeId: liveFolder });
    expect(await groupRound(left, rightSnapshot)).toMatchObject({ complete: true });
    deletePermanently(leftSnapshot.databasePath, folder, new Date().toISOString());
    await right.seed({ nodeId: child, parentNodeId: folder, title: 'Offline note', content: body });
    await right.seed({ ...movedIn, parentNodeId: folder, updatedAt: new Date().toISOString() });
    await right.seed({ ...movedOut, parentNodeId: folder });
    await right.seed({ ...movedOut, parentNodeId: liveFolder, updatedAt: new Date().toISOString() });

    await groupRound(right, leftSnapshot);
    expect(await groupRound(left, rightSnapshot)).toMatchObject({ complete: true });
    expect(await groupRound(right, leftSnapshot)).toMatchObject({ complete: true });
    const peers = [leftSnapshot, rightSnapshot];
    const notes = peers.map(({ databasePath }) => {
      expect(nodeTraces(databasePath, folder)).toMatchObject({ node: 0, tombstone: 1 });
      return withDb(databasePath, db => {
        expect(db.pragma('foreign_key_check')).toEqual([]);
        expect(db.prepare('SELECT 1 FROM parent_order_sources WHERE parent_id = ?').get(folder)).toBeUndefined();
        expect(db.prepare("SELECT 1 FROM sync_object_state WHERE object_type = 'parent_child_order' AND object_id = ?")
          .get(folder)).toBeUndefined();
        const location = db.prepare('SELECT parent_id, current_version_id, content FROM nodes WHERE id = ?');
        expect(location.get(movedIn.nodeId)).toMatchObject({ parent_id: INBOX_NODE_ID, content: movedIn.content });
        expect(location.get(movedOut.nodeId)).toMatchObject({ parent_id: liveFolder, content: movedOut.content });
        return location.get(child);
      });
    });
    expect(notes[0]).toMatchObject({ parent_id: INBOX_NODE_ID, content: body });
    expect(notes[1]).toEqual(notes[0]);
  });
});
