import { expect, it } from 'vitest';

import { port, setupVersionCollectionFixture, sqlite } from '../../../electron/database/nodeVersionPayloadCollector.testSupport.js';

import { applyNodeMemberPosition } from './nodeVersionMemberPositionApply.js';
import { nodePositionFactId, nodePositionPayloadSchema, nodePositionWriteStatements,
  type NodePositionPayload } from './nodeVersionMemberPositionFact.js';
import { publishLocalNodePosition } from './nodeVersionMemberPositionPublish.js';
import { RETIRE_RESOLVED_NODE_POSITIONS_SQL } from './nodeVersionRetiredPositions.js';
import { hashText } from './syncNodeResolution.js';

setupVersionCollectionFixture();

function position(overrides: Partial<NodePositionPayload> = {}): NodePositionPayload {
  return nodePositionPayloadSchema.parse({ adopted_version_id: 'E', device_identity_key: 'remote',
    group_id: 'group', library_epoch: 'original-epoch', object_id: 'node',
    pending_version_ids_json: '[]', proof_revision: 4, updated_at: 'original-time', ...overrides });
}

function record(payload: NodePositionPayload) {
  return { object_type: 'node_position', object_id: nodePositionFactId(payload),
    content_hash: hashText(JSON.stringify(payload)), payload_json: JSON.stringify(payload),
    deleted_at: null, updated_at: payload.updated_at };
}

function readPosition(device = 'remote') {
  return sqlite.prepare(`SELECT * FROM node_version_member_positions
    WHERE device_identity_key = ?`).get(device) as NodePositionPayload & { resolved_revision: number | null };
}

it('publishes complete adopted and pending positions once, and refuses missing bodies', async () => {
  sqlite.exec(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('fork', 'node', 'B', 'local', 'now', 'fork-hash', 'fork-body', '{"content":"fork-body"}');
    INSERT INTO node_sync_version_parents VALUES ('fork', 'B', 0)`);
  await port.transaction((tx) => publishLocalNodePosition(tx, 'node'));
  const first = readPosition('local');
  expect(first).toMatchObject({ adopted_version_id: 'E', pending_version_ids_json: '["fork"]' });
  await port.transaction((tx) => publishLocalNodePosition(tx, 'node'));
  expect(readPosition('local')).toEqual(first);
  sqlite.exec(`UPDATE nodes SET current_version_id = 'fork' WHERE id = 'node';
    UPDATE node_sync_versions SET body_text = NULL, snapshot_json = '{"content":null}' WHERE version_id = 'E'`);
  await port.transaction((tx) => publishLocalNodePosition(tx, 'node'));
  expect(readPosition('local')).toEqual(first);
});

it('relays original revisions, rejects collisions, and ignores late declarations', async () => {
  const newest = position();
  expect(await applyNodeMemberPosition(port, record(newest))).toBe(true);
  expect(await applyNodeMemberPosition(port, record(position({ proof_revision: 3, adopted_version_id: 'B' }))))
    .toBe(false);
  expect(await applyNodeMemberPosition(port, record(newest))).toBe(false);
  expect(readPosition()).toMatchObject(newest);
  await expect(applyNodeMemberPosition(port, record(position({ adopted_version_id: 'B' }))))
    .rejects.toThrow('node_position_revision_collision');
  await expect(applyNodeMemberPosition(port, record(position({ library_epoch: 'another-epoch' }))))
    .rejects.toThrow('node_position_epoch_changed');
  await expect(applyNodeMemberPosition(port, record(position({ proof_revision: 5, adopted_version_id: 'unknown' }))))
    .rejects.toThrow('node_position_lineage_unproven');
});

it('keeps exit claims until all live positions absorb them, and stale relays cannot revive them', async () => {
  await applyNodeMemberPosition(port, record(position({ adopted_version_id: 'B' })));
  sqlite.exec(`UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = 'remote';
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', 'third', 'anchor-third', '/third', 'Third', 'android', 'active', 'now', 'now')`);
  await port.run(RETIRE_RESOLVED_NODE_POSITIONS_SQL, ['node']);
  expect(readPosition().resolved_revision).toBeNull();
  for (const statement of nodePositionWriteStatements(position({ device_identity_key: 'third',
    pending_version_ids_json: '["A"]' }))) await port.run(statement.sql, statement.params);
  await port.run(RETIRE_RESOLVED_NODE_POSITIONS_SQL, ['node']);
  expect(readPosition().resolved_revision).toBeNull();
  await applyNodeMemberPosition(port, record(position({ device_identity_key: 'third', proof_revision: 5 })));
  await port.run(RETIRE_RESOLVED_NODE_POSITIONS_SQL, ['node']);
  expect(readPosition().resolved_revision).toBe(4);
  expect(await applyNodeMemberPosition(port, record(position({ adopted_version_id: 'B' })))).toBe(false);
  expect(readPosition().resolved_revision).toBe(4);
});
