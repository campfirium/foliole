import path from 'node:path';
import { digest } from './security-inputs.mjs';
import { readOwnerRecords, writeOwnerRecord } from './security-owner-files.mjs';
import { changedSecuritySignals } from './security-notification-signals.mjs';
import { normalizeSecurityNotificationSignals } from './security-notification-policy.mjs';

export const SECURITY_NOTIFICATION_GROUPS = ['android', 'ios', 'shared'];

function groupFor(signal) {
  if (signal.platform === 'android') return 'android';
  if (signal.platform === 'ios') return 'ios';
  if (signal.platform === 'build-tools' && signal.package === 'gradle') return 'android';
  const scope = signal.scope ?? '';
  if (/:embedded-native:(?:vendor-notices|component-notices)$/u.test(scope)) return 'android';
  if (/(?:^|:)(?:android[^:]*|gradle|jdk)(?::|$)/u.test(scope)) return 'android';
  if (/(?:^|:)(?:ios[^:]*|swift-native|apple-tools|apple-os-webkit)(?::|$)/u.test(scope)) return 'ios';
  return 'shared';
}

export function groupSecuritySignals(signals, group) {
  return Object.fromEntries(Object.entries(normalizeSecurityNotificationSignals(signals))
    .filter(([, signal]) => groupFor(signal) === group));
}

const batchRecords = owner => readOwnerRecords(path.join(owner, 'notification-batches'));
const latestBatch = (records, group) => records.filter(record => record.group === group)
  .sort((a, b) => a.sequence - b.sequence).at(-1);

// Like PR batches: wait for a quiet interval, bounded by the first arrival.
// Immutable snapshots retain pending changes across producer/process restarts.
export function readySecurityBatch(owner, history, signals, group, now, options) {
  const baseline = history.findLast(record => !record.group || record.group === group);
  const previous = groupSecuritySignals(baseline?.signals ?? {}, group);
  const current = groupSecuritySignals(signals, group);
  const changes = changedSecuritySignals(previous, current);
  const records = batchRecords(owner);
  const pending = latestBatch(records, group);
  const sameBaseline = pending?.baselineId === (baseline?.id ?? null);
  const unchanged = sameBaseline && !changedSecuritySignals(groupSecuritySignals(pending.signals, group), current).length;
  let batch = pending;
  if (!unchanged) {
    const continuing = sameBaseline && pending.active;
    const contents = { schemaVersion: 1, group, baselineId: baseline?.id ?? null,
      sequence: (pending?.sequence ?? 0) + 1, signals: current, active: changes.length > 0,
      firstObservedAt: continuing ? pending.firstObservedAt : now, lastChangedAt: now };
    batch = { ...contents, id: digest(JSON.stringify(contents)) };
    writeOwnerRecord(path.join(owner, 'notification-batches'), batch);
  }
  if (!changes.length) return;
  const quietMs = options.batchQuietMs ?? 300_000;
  const maxWaitMs = options.batchMaxWaitMs ?? 1_800_000;
  if (now - batch.lastChangedAt < quietMs && now - batch.firstObservedAt < maxWaitMs) return;
  return { group, previous, signals: current, changes, batchId: batch.id };
}

export function pendingSecurityNotificationBatches(owner) {
  const history = readOwnerRecords(path.join(owner, 'notifications'));
  const records = batchRecords(owner);
  return SECURITY_NOTIFICATION_GROUPS.flatMap(group => {
    const batch = latestBatch(records, group);
    if (!batch?.active || history.some(record => record.batchId === batch.id)) return [];
    return [{ group, firstObservedAt: new Date(batch.firstObservedAt).toISOString(),
      lastChangedAt: new Date(batch.lastChangedAt).toISOString(), batchId: batch.id }];
  });
}
