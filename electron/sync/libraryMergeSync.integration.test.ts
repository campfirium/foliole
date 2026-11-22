// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { INSERT_REVIEW_EVENT_SQL } from '../../lib/core/database/reviewLogRecord.js';

import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess,
  readDesktopFramedSyncLibraryEvidence
} from './desktopFramedSyncTwoProcess.testSupport.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];

afterEach(async () => {
  await Promise.allSettled(processes.splice(0).map((process) => process.close()));
  if (root) await fs.rm(root, { force: true, recursive: true });
  root = '';
});

it('sends merged notes and their reviews to the other device like any local change', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  // A library from another device that never synced with this group.
  const other = await fixture.startThird();
  await other.process.seed({ content: 'Merged parent body', kind: 'folder', nodeId: 't326-merge-parent', title: 'Old folder' });
  await other.process.seed({ content: 'Merged child body', nodeId: 't326-merge-child', parentNodeId: 't326-merge-parent', title: 'Old topic' });
  await other.process.close();
  const source = new Database(other.snapshot.databasePath);
  source.prepare(INSERT_REVIEW_EVENT_SQL).run(['merge-op', 'merge-op', 'old', 't326-merge-child', 3, 'fsrs-6',
    '2026-10-01T00:00:00.000Z', 'review', null]);
  source.close();

  const merged = await fixture.left.invoke('library_merge', { sourcePath: other.snapshot.databasePath });
  expect(merged).toMatchObject({ added: 2, reviewsAdded: 1 });
  await expect(fixture.left.synchronize(fixture.rightSnapshot.origin)).resolves.toMatchObject({ complete: true });

  const sent = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([
    expect.objectContaining({ content: 'Merged child body', id: 't326-merge-child', parent_id: 't326-merge-parent' }),
    expect.objectContaining({ id: 't326-merge-parent', parent_id: (merged as { folderId: string }).folderId })
  ]);
  expect(received.reviews).toEqual([{ grade: 3, node_id: 't326-merge-child', op_id: 'merge-op' }]);
  expect(received.versions).toEqual(sent.versions);
});
