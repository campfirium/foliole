// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { buildResolutionRecord } from '../../lib/core/sync/syncNodeResolution.js';
import { validateStoredVersionDependencies } from '../../lib/core/sync/syncPackNodeVersionDependencyValidation.js';
import { closeLibraries, createPeer, edit, startLibraries } from '../database/syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

async function setup() {
  const left = createPeer('left');
  const right = createPeer('right');
  edit(left, 'Shared');
  edit(right, 'Shared');
  const a = (await loadCurrentSyncNodeRecord(left.port, 'topic'))!;
  const b = (await loadCurrentSyncNodeRecord(right.port, 'topic'))!;
  const resolution = buildResolutionRecord([a, b], a, 'Shared');
  left.db.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, 'topic', ?, ?, ?, ?, ?, ?)`).run(resolution.version_id, a.version_id,
    resolution.host_name, resolution.version_created_at, resolution.content_hash,
    resolution.body_text, JSON.stringify(resolution.snapshot));
  left.db.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)')
    .run(resolution.version_id, a.version_id);
  left.db.prepare('ATTACH DATABASE ? AS inc').run(right.file);
  return { left, right, a, b, resolution };
}

it.each([false, true])('accepts exact reconstructed frontiers without changing stored edges (childOmitted=%s)', async omitted => {
  const { left, b, resolution } = await setup();
  const before = left.db.prepare('SELECT * FROM node_sync_version_parents').all();
  await validateStoredVersionDependencies(left.port, omitted ? [] : [{
    version_id: resolution.version_id!, object_id: 'topic', parent_version_id: b.version_id
  }], [{ version_id: resolution.version_id!, parent_version_id: b.version_id!, ordinal: 0 }], 'inc');
  expect(left.db.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual(before);
});

it.each(['unknown-parent', 'wrong-object', 'changed-time', 'missing-body', 'changed-resolution', 'extra-parent'])(
  'rejects unproven contracted frontiers: %s', async mutation => {
    const { left, right, b, resolution } = await setup();
    let parent = b.version_id!;
    if (mutation === 'unknown-parent') parent = 'unknown';
    if (mutation === 'wrong-object') right.db.prepare("UPDATE node_sync_versions SET object_id = 'other'").run();
    if (mutation === 'changed-time') right.db.prepare("UPDATE node_sync_versions SET created_at = '2099-01-01T00:00:00Z'").run();
    if (mutation === 'missing-body') right.db.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL)`).run();
    if (mutation === 'changed-resolution') left.db.prepare(`UPDATE node_sync_versions SET body_text = 'Changed'
      WHERE version_id = ?`).run(resolution.version_id);
    const parents = [{ version_id: resolution.version_id!, parent_version_id: parent, ordinal: 0 }];
    if (mutation === 'extra-parent') parents.push({ ...parents[0]!, parent_version_id: 'unproven', ordinal: 1 });
    await expect(validateStoredVersionDependencies(left.port, [], parents, 'inc'))
      .rejects.toThrow('sync_pack_node_version_parent_mismatch');
  }
);
