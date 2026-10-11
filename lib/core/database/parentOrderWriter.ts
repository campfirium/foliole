import type { DatabaseDriver } from './driver.js';
import { hashTextBody } from './textBodyHash.js';

export function parentOrderWriterIdentity(input: { deviceAnchor: string; libraryPath: string; sourceEpoch: string }) {
  const bindingId = hashTextBody(JSON.stringify([input.deviceAnchor, input.libraryPath]));
  return { bindingId, authorId: hashTextBody(JSON.stringify([bindingId, input.sourceEpoch])) };
}

/** The host supplies the same stable anchor and canonical library binding used for pairing. */
export function bindParentOrderWriter(driver: DatabaseDriver, binding: {
  deviceAnchor: string; libraryPath: string;
}) {
  const epoch = driver.queryOne<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1');
  if (!epoch || !binding.deviceAnchor || !binding.libraryPath) throw new Error('parent_order_writer_binding_missing');
  const { bindingId, authorId } = parentOrderWriterIdentity({ ...binding, sourceEpoch: epoch.source_epoch });
  driver.execute(`INSERT INTO parent_order_writer VALUES (1, ?, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET binding_id = excluded.binding_id,
      source_epoch = excluded.source_epoch, author_id = excluded.author_id`,
  [bindingId, epoch.source_epoch, authorId]);
  return authorId;
}

/** A restore epoch rotates this writer before its first edit; sources from earlier epochs stay immutable. */
export function requireParentOrderWriter(driver: DatabaseDriver) {
  const writer = driver.queryOne<{ binding_id: string; source_epoch: string; author_id: string;
    current_epoch: string }>(`SELECT writer.*, sequence.source_epoch AS current_epoch
      FROM parent_order_writer writer JOIN sync_state_sequence sequence ON sequence.singleton_id = writer.singleton_id
      WHERE writer.singleton_id = 1`);
  if (!writer) throw new Error('parent_order_writer_binding_missing');
  if (writer.source_epoch === writer.current_epoch) return writer.author_id;
  const authorId = hashTextBody(JSON.stringify([writer.binding_id, writer.current_epoch]));
  driver.execute('UPDATE parent_order_writer SET source_epoch = ?, author_id = ? WHERE singleton_id = 1',
    [writer.current_epoch, authorId]);
  return authorId;
}
