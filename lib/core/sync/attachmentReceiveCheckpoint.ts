import type { DbPort } from './dbPort.js';

export interface AttachmentReceiveCheckpoint {
  load(totalBytes: number): Promise<number>;
  save(totalBytes: number, confirmedBytes: number): Promise<void>;
  clear(): Promise<void>;
}

export const ATTACHMENT_RECEIVE_CHECKPOINT_SQL = {
  load: `SELECT total_bytes, confirmed_bytes FROM attachment_receive_checkpoints
    WHERE content_hash = ? AND temporary_path = ?`,
  save: `INSERT INTO attachment_receive_checkpoints
    (content_hash, temporary_path, total_bytes, confirmed_bytes) VALUES (?, ?, ?, ?)
    ON CONFLICT(content_hash, temporary_path) DO UPDATE SET
      total_bytes = excluded.total_bytes, confirmed_bytes = excluded.confirmed_bytes`,
  clear: `DELETE FROM attachment_receive_checkpoints
    WHERE content_hash = ? AND temporary_path = ?`
} as const;

export function createAttachmentReceiveCheckpoint(
  port: DbPort, filePath: string, contentHash: string
): AttachmentReceiveCheckpoint {
  const identity = [contentHash, `${filePath}.unverified`];
  return {
    async load(totalBytes) {
      const [row] = await port.query<{ total_bytes: number; confirmed_bytes: number }>(
        ATTACHMENT_RECEIVE_CHECKPOINT_SQL.load, identity);
      return row?.total_bytes === totalBytes ? row.confirmed_bytes : 0;
    },
    async save(totalBytes, confirmedBytes) {
      await port.run(ATTACHMENT_RECEIVE_CHECKPOINT_SQL.save,
      [...identity, totalBytes, confirmedBytes]);
    },
    async clear() {
      await port.run(ATTACHMENT_RECEIVE_CHECKPOINT_SQL.clear, identity);
    }
  };
}
