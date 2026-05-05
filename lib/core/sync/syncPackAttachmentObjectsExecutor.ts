import type { DbPort } from './dbPort.js';
import { applySyncObjectPayloadWithDbPort } from './syncObjectPayloadExecutor.js';
import {
  loadSyncPackSyncObjectsWithDbPort,
  type SyncPackSyncObjectsOptions
} from './syncPackSyncObjectsExecutor.js';

export async function applySyncPackAttachmentObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'attachment' || record.object_type === 'pdf_page_text');
  for (const record of records) {
    await applySyncObjectPayloadWithDbPort(port, record);
  }
  return records.length;
}
