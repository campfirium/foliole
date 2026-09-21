import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { DbPort } from '../../lib/core/sync/dbPort';

import { seedCapacityNodes } from './capacityAcceptanceFixture';
import { requireValue, sha256 } from './capacityAcceptanceSafety';

export type CapacityWorkspaceStage = 0 | 1000 | 10000;

const stamp = '2026-09-20T00:00:00.000Z';

export async function inspectCapacityWorkspace(db: DbPort): Promise<CapacityWorkspaceStage> {
  const unexpected = await db.query<{ id: string }>(
    "SELECT id FROM nodes WHERE id <> ? AND id NOT GLOB 'node-[0-9]*' LIMIT 1", [INBOX_NODE_ID]
  );
  requireValue(unexpected.length === 0, `Refusing non-T219 workspace content: ${unexpected[0]?.id ?? 'unknown'}`);
  const rows = await db.query<{ id: string; title: string }>(
    "SELECT id, title FROM nodes WHERE id GLOB 'node-[0-9]*' ORDER BY CAST(substr(id, 6) AS INTEGER)"
  );
  requireValue([0, 1000, 10000].includes(rows.length), `Unsupported T219 workspace stage: ${rows.length}`);
  rows.forEach((row, index) => {
    requireValue(row.id === `node-${index}` && row.title === `Topic ${index}`, `T219 fixture mismatch: ${index}`);
  });
  const [inbox] = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM nodes WHERE id = ?', [INBOX_NODE_ID]);
  requireValue(Number(inbox?.count) === 1, 'Normal companion Inbox is missing');
  return rows.length as CapacityWorkspaceStage;
}

export async function prepareCapacityWorkspace(db: DbPort, target: 1000 | 10000, hostName: string) {
  const stage = await inspectCapacityWorkspace(db);
  requireValue(stage === 0 && target === 1000 || stage === 1000 && target === 10000,
    `Refusing T219 workspace transition: ${stage} -> ${target}`);
  await seedCapacityNodes(db, stage, target - stage, hostName);
  if (stage === 0) await makeReadingTopicEditable(db, hostName);
  requireValue(await inspectCapacityWorkspace(db) === target, 'T219 workspace preparation did not reach its target');
  return target;
}

async function makeReadingTopicEditable(db: DbPort, hostName: string) {
  const [node] = await db.query<{ content: string; title: string }>(
    'SELECT content, title FROM nodes WHERE id = ?', ['node-1']
  );
  requireValue(node, 'T219 reading topic is missing');
  const versionId = 't219-node-1-base';
  const snapshot = {
    body_blob_hash: null, content: node.content, created_at: stamp, deleted_at: null,
    hide_title_heading: false, id: 'node-1', kind: 'topic', parent_id: 'node-0', title: node.title,
    updated_at: stamp
  };
  await db.run(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
  [versionId, 'node-1', hostName, stamp, await sha256(JSON.stringify(snapshot)), node.content, JSON.stringify(snapshot)]);
  await db.run("UPDATE nodes SET kind = 'folder' WHERE id = 'node-0'");
  await db.run('UPDATE nodes SET current_version_id = ? WHERE id = ?', [versionId, 'node-1']);
}
