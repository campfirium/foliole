import path from 'node:path';
import { digest } from './security-inputs.mjs';
import { readOwnerRecords, writeOwnerRecord } from './security-owner-files.mjs';
import { projectSecurityOwner } from './security-owner.mjs';
import { securityNotificationSignals } from './security-notification-signals.mjs';
import { readySecurityBatch, SECURITY_NOTIFICATION_GROUPS } from './security-notification-batches.mjs';
import { enqueueSecurityNotification, securityDeliveryStatus } from './security-notification-transport.mjs';

const records = owner => readOwnerRecords(path.join(owner, 'notifications'))
  .sort((a, b) => a.sequence - b.sequence);

function planNotification(owner, workspace, now, options) {
  const history = records(owner);
  const signals = securityNotificationSignals(projectSecurityOwner(owner, now));
  for (const group of SECURITY_NOTIFICATION_GROUPS) {
    const batch = readySecurityBatch(owner, history, signals, group, now, options);
    if (!batch) continue;
    const record = notificationRecord(batch, history, workspace, now);
    writeOwnerRecord(path.join(owner, 'notifications'), record);
    history.push(record);
  }
}

function notificationRecord({ group, signals, changes, batchId }, history, workspace, now) {
  const sequence = (history.at(-1)?.sequence ?? 0) + 1;
  const id = digest(JSON.stringify({ group, batchId }));
  const label = { android: 'Android', ios: 'iPhone', shared: 'shared' }[group];
  const event = { schemaVersion: 1, id: `security-${id}`, source: 'foliole/security-maintenance',
    dedupeKey: `foliole:security:${id}`, path: workspace, title: `Foliole ${label} security maintenance changes`, ttlSeconds: 7 * 86400,
    prompt: `Security maintenance group ${group} has ${changes.length} changed findings or source states, combined after debounce. Read docs/maintenance/security-owner.md and run node scripts/security/security-owner-cli.mjs status in this local project. Review the durable notification ${id} and its previous/current facts together as one ${label} batch; other groups have separate notifications. Verify current candidate and official evidence before any remediation. Existing dispositions do not close upstream alerts. This notification authorizes investigation only; do not merge PRs, close/ignore alerts, change security settings, or publish. Preserve source failures and unknown coverage.\nSummary:\n${changes.slice(0, 12).map(change => `${change.state}: ${change.key}`).join('\n')}${changes.length > 12 ? '\nAdditional changes are in the durable notification record.' : ''}` };
  return { schemaVersion: 1, id, sequence, group, batchId,
    checkedAt: new Date(now).toISOString(), signals, changes, event };
}

export function notifySecurityOwner(owner, workspace, options = {}) {
  planNotification(owner, workspace, options.now ?? Date.now(), options);
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
