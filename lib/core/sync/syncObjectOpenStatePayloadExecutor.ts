import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyNodeOpenStateObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_open_state WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const nodeId = text(payload.node_id) ?? record.object_id;
  const lastOpenedAt = text(payload.last_opened_at);
  if (!lastOpenedAt || !Number.isFinite(Date.parse(lastOpenedAt))) {
    throw new Error('Invalid node open state timestamp');
  }
  await port.run(
    `INSERT INTO node_open_state (node_id, last_opened_at) VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET last_opened_at = excluded.last_opened_at
     WHERE excluded.last_opened_at > node_open_state.last_opened_at`,
    [nodeId, lastOpenedAt]
  );
}
