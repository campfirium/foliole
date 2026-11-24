import fs from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const recordFile = fileURLToPath(new URL('./play-snapshot-reconciliations.json', import.meta.url));

export function readPlaySnapshotReconciliations(file = recordFile) {
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (record?.schemaVersion !== 1 || !Array.isArray(record.reconciliations) || record.reconciliations.some(item =>
    !Number.isSafeInteger(item?.deploymentId) || item.deploymentId < 1 || typeof item.marker !== 'string' ||
    item.marker === 'cleared' || !item.marker || !Number.isSafeInteger(item.statusId) || item.statusId < 1 ||
    !Number.isFinite(Date.parse(item.statusCreatedAt)) || typeof item.authorization !== 'string' ||
    item.authorization.trim().length < 20)) {
    throw new Error('Play snapshot reconciliation record is invalid');
  }
  return record.reconciliations;
}

// A reconciliation applies only while the exact authorized marker is still the deployment's newest status.
export function isReconciledPlaySnapshot(id, value, { status, latest }, reconciliations) {
  return reconciliations.some(item => item.deploymentId === id && item.marker === value &&
    status?.id === item.statusId && status.created_at === item.statusCreatedAt &&
    latest?.id === item.statusId && latest.created_at === item.statusCreatedAt);
}
