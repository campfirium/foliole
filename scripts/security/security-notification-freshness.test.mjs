// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { notificationObservation } from './security-notification-fixture.mjs';
import { importSecurityObservation, projectSecurityOwner } from './security-owner.mjs';
import { readOwnerRecords, writeOwnerRecord } from './security-owner-files.mjs';
import { notifySecurityOwner } from './security-notifications.mjs';
import { pendingSecurityNotificationBatches } from './security-notification-batches.mjs';

const roots = [];
const now = Date.now();
const expiredAt = now + 27 * 3600_000;
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function setup(status = 'clean') {
  const base = path.resolve('.tmp/artifacts/T683');
  mkdirSync(base, { recursive: true });
  const owner = mkdtempSync(path.join(base, 'freshness-'));
  roots.push(owner);
  importSecurityObservation(owner, notificationObservation(now, { status }));
  const submit = event => ({ eventId: event.id });
  const notify = time => notifySecurityOwner(owner, process.cwd(), { now: time, batchQuietMs: 0, submit });
  return { owner, notify };
}

const history = owner => readOwnerRecords(path.join(owner, 'notifications')).sort((first, second) => first.sequence - second.sequence);

it.each(['clean', 'findings'])('keeps expired %s coverage visible without opening new chats', status => {
  const { owner, notify } = setup(status);
  notify(now);
  const count = history(owner).length;
  notify(expiredAt);
  expect(history(owner)).toHaveLength(count);
  const state = projectSecurityOwner(owner, expiredAt);
  expect(state.sources.some(source => source.scope.endsWith('npm-build:npm-audit') && source.stale)).toBe(true);
  expect(state.overallStatus).toBe('incomplete');
  if (status === 'findings') expect(state.findings.some(finding => finding.active)).toBe(true);
  expect(pendingSecurityNotificationBatches(owner)).toEqual([]);
  importSecurityObservation(owner, notificationObservation(expiredAt, { id: 2, status }));
  notify(expiredAt);
  expect(history(owner)).toHaveLength(count);
});

it('still delivers a real failure, its recovery, and a changed finding after coverage expires', () => {
  const { owner, notify } = setup('findings');
  notify(now);
  notify(expiredAt);
  expect(history(owner)).toHaveLength(1);
  importSecurityObservation(owner, notificationObservation(expiredAt, { id: 2, status: 'error' }));
  notify(expiredAt);
  expect(history(owner)).toHaveLength(2);
  expect(history(owner).at(-1).changes.some(change => change.current?.status === 'error')).toBe(true);
  expect(projectSecurityOwner(owner, expiredAt).findings.some(finding => finding.active)).toBe(true);
  notify(expiredAt + 27 * 3600_000);
  expect(history(owner)).toHaveLength(2);
  importSecurityObservation(owner, notificationObservation(expiredAt + 28 * 3600_000,
    { id: 3, status: 'findings', version: '1.1.0' }));
  notify(expiredAt + 28 * 3600_000);
  const changes = history(owner).at(-1).changes;
  expect(history(owner)).toHaveLength(3);
  expect(changes.some(change => change.state === 'recovered' && change.key.startsWith('source:'))).toBe(true);
  expect(changes.some(change => change.current?.versions?.includes('1.1.0'))).toBe(true);
});

it('normalizes a previously delivered stale baseline without sending false recovery chats', () => {
  const { owner, notify } = setup();
  const id = 'e'.repeat(64);
  const scope = 'local:linux:x64:npm-build:npm-audit';
  const signals = { [`source:${scope}`]: { kind: 'source', scope, status: 'clean', stale: true, reason: null } };
  writeOwnerRecord(path.join(owner, 'notifications'), { schemaVersion: 1, id, sequence: 1,
    group: 'shared', signals, changes: [], event: { id: `security-${id}` } });
  writeOwnerRecord(path.join(owner, 'notification-enqueues'), { schemaVersion: 1, id });
  writeOwnerRecord(path.join(owner, 'notification-batches'), { schemaVersion: 1, id: 'd'.repeat(64),
    group: 'shared', baselineId: id, sequence: 1, signals, active: true,
    firstObservedAt: now, lastChangedAt: now });
  notify(expiredAt);
  expect(history(owner)).toHaveLength(1);
  expect(pendingSecurityNotificationBatches(owner)).toEqual([]);
});
