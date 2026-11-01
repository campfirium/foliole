import path from 'node:path';
import { digest } from './security-inputs.mjs';
import { readOwnerRecords, writeOwnerRecord } from './security-owner-files.mjs';
import { projectSecurityOwner } from './security-owner.mjs';
import { changedSecuritySignals, securityNotificationSignals } from './security-notification-signals.mjs';
import { enqueueSecurityNotification, securityDeliveryStatus } from './security-notification-transport.mjs';

const records = owner => readOwnerRecords(path.join(owner, 'notifications'))
  .sort((a, b) => a.sequence - b.sequence);

function planNotification(owner, workspace, now) {
  const history = records(owner);
  const previous = history.at(-1);
  const signals = securityNotificationSignals(projectSecurityOwner(owner, now));
  const changes = changedSecuritySignals(previous?.signals ?? {}, signals);
  if (!changes.length) return;
  const sequence = (previous?.sequence ?? 0) + 1;
  const id = digest(JSON.stringify({ previous: previous?.id ?? null, signals }));
  const event = { schemaVersion: 1, id: `security-${id}`, source: 'foliole/security-maintenance',
    dedupeKey: `foliole:security:${id}`, path: workspace, title: 'Foliole security maintenance changes', ttlSeconds: 7 * 86400,
    prompt: `Security maintenance has ${changes.length} changed findings or source states. Read docs/maintenance/security-owner.md and run node scripts/security/security-owner-cli.mjs status in this local project. Review the durable notification ${id} and its previous/current facts. Verify current candidate and official evidence before any remediation. Existing dispositions do not close upstream alerts. This notification authorizes investigation only; do not merge PRs, close/ignore alerts, change security settings, or publish. Preserve source failures and unknown coverage.\nSummary:\n${changes.slice(0, 12).map(change => `${change.state}: ${change.key}`).join('\n')}${changes.length > 12 ? '\nAdditional changes are in the durable notification record.' : ''}` };
  writeOwnerRecord(path.join(owner, 'notifications'), { schemaVersion: 1, id, sequence,
    checkedAt: new Date(now).toISOString(), signals, changes, event });
}

export function notifySecurityOwner(owner, workspace, options = {}) {
  planNotification(owner, workspace, options.now ?? Date.now());
  const receipts = new Set(readOwnerRecords(path.join(owner, 'notification-enqueues')).map(record => record.id));
  const submit = options.submit ?? (event => enqueueSecurityNotification(event, options));
  for (const record of records(owner)) {
    if (receipts.has(record.id)) continue;
    // An intent is durable before submit; retry uses exactly the same transport identity.
    let receipt;
    try { receipt = submit(record.event); }
    catch (error) {
      const attempt = { schemaVersion: 1, notification: record.id, error: error.message,
        checkedAt: new Date(options.now ?? Date.now()).toISOString() };
      attempt.id = digest(JSON.stringify(attempt));
      writeOwnerRecord(path.join(owner, 'notification-errors'), attempt);
      throw error;
    }
    options.beforeCheckpoint?.(record, receipt);
    writeOwnerRecord(path.join(owner, 'notification-enqueues'), { schemaVersion: 1, id: record.id,
      eventId: record.event.id, receipt, enqueuedAt: new Date(options.now ?? Date.now()).toISOString() });
  }
  return securityNotificationStatus(owner, options.codexHome);
}

export function securityNotificationStatus(owner, codexHome) {
  const receipts = new Map(readOwnerRecords(path.join(owner, 'notification-enqueues')).map(record => [record.id, record]));
  const errors = readOwnerRecords(path.join(owner, 'notification-errors')).sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
  return records(owner).map(record => ({ id: record.id, sequence: record.sequence,
    changes: record.changes.length, enqueue: receipts.get(record.id) ?? null,
    enqueueError: receipts.has(record.id) ? null : errors.filter(error => error.notification === record.id).at(-1) ?? null,
    delivery: securityDeliveryStatus(record.event, codexHome) }));
}
