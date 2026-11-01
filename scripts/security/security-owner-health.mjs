import path from 'node:path';
import { digest } from './security-inputs.mjs';
import { readOwnerRecords, writeOwnerRecord } from './security-owner-files.mjs';

export function projectOwnerHealth(owner) {
  const records = readOwnerRecords(path.join(owner, 'health')).sort((a, b) =>
    a.evidenceAt.localeCompare(b.evidenceAt) || a.sequence - b.sequence || a.checkedAt.localeCompare(b.checkedAt) || a.id.localeCompare(b.id));
  const latest = new Map();
  for (const record of records) latest.set(record.role, record);
  return [...latest.values()];
}

export function recordOwnerHealth(owner, { role, status, reason, evidenceAt }, now = Date.now()) {
  if (!role || !['clean', 'error'].includes(status) || !Number.isFinite(Date.parse(evidenceAt))) {
    throw new Error('Malformed owner source health');
  }
  const previous = projectOwnerHealth(owner).find(value => value.role === role);
  if (previous?.status === status && previous.reason === reason) return { duplicate: true, record: previous };
  const record = { schemaVersion: 1, role, status, reason, evidenceAt: new Date(evidenceAt).toISOString(),
    sequence: (previous?.sequence ?? 0) + 1,
    checkedAt: new Date(now).toISOString() };
  record.id = digest(JSON.stringify(record));
  return { ...writeOwnerRecord(path.join(owner, 'health'), record), record };
}
