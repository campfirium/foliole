import { parentOrderWriterIdentity } from '../database/parentOrderWriter.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';

export async function bindParentOrderWriterWithDbPort(db: DbPort, binding: {
  deviceAnchor: string; libraryPath: string;
}) {
  const [epoch] = await db.query<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1');
  if (!epoch || !binding.deviceAnchor || !binding.libraryPath) throw new Error('parent_order_writer_binding_missing');
  const { bindingId, authorId } = parentOrderWriterIdentity({ ...binding, sourceEpoch: epoch.source_epoch });
  await db.run(`INSERT INTO parent_order_writer VALUES (1, ?, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET binding_id = excluded.binding_id,
      source_epoch = excluded.source_epoch, author_id = excluded.author_id`,
  [bindingId, epoch.source_epoch, authorId]);
  return authorId;
}

export async function requireParentOrderWriterWithDbPort(db: DbPort) {
  const [writer] = await db.query<{ binding_id: string; source_epoch: string; author_id: string;
    current_epoch: string }>(`SELECT writer.*, sequence.source_epoch AS current_epoch
      FROM parent_order_writer writer JOIN sync_state_sequence sequence ON sequence.singleton_id = writer.singleton_id
      WHERE writer.singleton_id = 1`);
  if (!writer) throw new Error('parent_order_writer_binding_missing');
  if (writer.source_epoch === writer.current_epoch) return writer.author_id;
  const authorId = hashTextBody(JSON.stringify([writer.binding_id, writer.current_epoch]));
  await db.run('UPDATE parent_order_writer SET source_epoch = ?, author_id = ? WHERE singleton_id = 1',
    [writer.current_epoch, authorId]);
  return authorId;
}
