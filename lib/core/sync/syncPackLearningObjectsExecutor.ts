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
    .filter((record) => record.object_type === 'node_reading' || record.object_type === 'node_review');
  for (const record of records) {
    await applySyncObjectPayloadWithDbPort(port, record, { deviceId: options.deviceId });
  }
  return records.length;
}
