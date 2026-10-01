import { createOpaqueVersionRef } from '../sync/opaqueSyncRefs.js';
import { hashText } from '../sync/syncNodeResolution.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { projectNodeResourceLinks } from './nodeResourceReferences.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

interface CurrentHead {
  id: string; resource_references: string; version_id: string; host_name: string;
  created_at: string; content_hash: string; body_text: string | null; snapshot_json: string;
}

/** Adds one current fact version; never rewrites or traverses historical versions. */
export function appendMigratedNodeResourceVersions(db: DatabaseMigrationTarget) {
  const heads = db.prepare(`SELECT n.id, n.resource_references, v.version_id, v.host_name,
    v.created_at, v.content_hash, v.body_text, v.snapshot_json FROM nodes n
    JOIN node_sync_versions v ON v.version_id = n.current_version_id
    WHERE n.resource_references <> '[]' AND v.snapshot_json IS NOT NULL`).all() as CurrentHead[];
  for (const head of heads) appendHead(db, head);
}

function appendHead(db: DatabaseMigrationTarget, head: CurrentHead) {
  const previous = JSON.parse(head.snapshot_json);
  const snapshot = { ...previous, resource_references: head.resource_references,
    attachments: projectNodeResourceLinks(head.resource_references) };
  const json = JSON.stringify(snapshot);
  const hash = hashText(json);
  const id = createOpaqueVersionRef(crypto.randomUUID());
  db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id, host_name,
    created_at, content_hash, body_text, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, head.id, head.version_id, head.host_name, head.created_at, hash, head.body_text, json);
  db.prepare('INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)')
    .run(id, head.version_id);
  db.prepare('UPDATE nodes SET current_version_id = ?, sync_dirty = 0 WHERE id = ?').run(id, head.id);
  db.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq, current_version_id,
    content_hash, base_content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('node', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
    current_version_id = excluded.current_version_id, content_hash = excluded.content_hash,
    base_content_hash = excluded.base_content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
    updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_dirty = 1`)
    .run(head.id, id, hash, head.content_hash, head.host_name, snapshot.updated_at ?? head.created_at, snapshot.deleted_at ?? null);
}
