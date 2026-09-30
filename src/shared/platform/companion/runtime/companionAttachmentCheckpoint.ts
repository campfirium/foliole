import { createAttachmentReceiveCheckpoint } from '../../../../../lib/core/sync/attachmentReceiveCheckpoint.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';
import { classifyResourceFailure } from '../../../../../lib/platform/resourceAvailabilityContract.js';

export function handleCompanionAttachmentCheckpoint(
  owner: { databasePath: string; runWriter<T>(task: (db: DbPort) => Promise<T>): Promise<T> },
  payload: Record<string, unknown>
) {
  if (payload.database_path !== owner.databasePath || typeof payload.temporary_path !== 'string' ||
      !payload.temporary_path.endsWith('.unverified') || typeof payload.content_hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(payload.content_hash)) {
    throw new Error('attachment_checkpoint_identity_invalid');
  }
  const path = payload.temporary_path.slice(0, -'.unverified'.length);
  const hash = payload.content_hash;
  return owner.runWriter(async (db) => {
    const checkpoint = createAttachmentReceiveCheckpoint(db, path, hash);
    if (payload.action === 'clear') { await checkpoint.clear(); return {}; }
    const total = bytes(payload.total_bytes);
    if (payload.action === 'load') return { confirmed_bytes: await checkpoint.load(total) };
    if (payload.action !== 'save') throw new Error('attachment_checkpoint_operation_invalid');
    const confirmed = bytes(payload.confirmed_bytes);
    if (confirmed > total) throw new Error('attachment_checkpoint_offset_invalid');
    await checkpoint.save(total, confirmed);
    return {};
  }).catch((error: unknown) => {
    if (classifyResourceFailure(error) === 'disk_full') throw new Error('attachment_checkpoint_disk_full');
    throw error;
  });
}

function bytes(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('attachment_checkpoint_offset_invalid');
  }
  return value;
}
