import type { DbPort } from './dbPort.js';
import { applySyncObjectPayloadWithDbPort } from './syncObjectPayloadExecutor.js';
import {
  loadSyncPackSyncObjectsWithDbPort,
  type SyncPackSyncObjectsOptions
} from './syncPackSyncObjectsExecutor.js';

export async function applySyncPackLearningObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'node_reading' || record.object_type === 'node_review' ||
      record.object_type === 'topic_daily_count' || record.object_type === 'foreground_daily_time');
  for (const record of records) {
    await applySyncObjectPayloadWithDbPort(port, record, options.hostName ? { hostName: options.hostName } : {});
  }
  return records.length;
}
