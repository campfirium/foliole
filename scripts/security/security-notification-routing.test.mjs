// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { notificationObservation } from './security-notification-fixture.mjs';
import { importSecurityObservation, projectSecurityOwner, setSecurityDisposition } from './security-owner.mjs';
import { notifySecurityOwner } from './security-notifications.mjs';
import { readOwnerRecords } from './security-owner-files.mjs';

const roots = [];
const now = Date.now();
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function setup() {
  const base = path.resolve('.tmp/artifacts/T674-8');
  mkdirSync(base, { recursive: true });
  const owner = mkdtempSync(path.join(base, 'routing-'));
  roots.push(owner);
  const submitted = [];
  const notify = timestamp => notifySecurityOwner(owner, process.cwd(), {
    now: timestamp, batchQuietMs: 0,
    submit: event => { submitted.push(event); return { eventId: event.id }; }
  });
  return { owner, submitted, notify };
}

function observe(owner, offset, severity = 'info', status = 'findings') {
  const input = notificationObservation(now + offset, { id: offset + 1, status: 'clean' });
  const report = JSON.parse(input.rawReport);
  const check = report.coverage.find(row => row.id === 'swift-native').checks
    .find(row => row.route === 'official-review');
  Object.assign(check, { status, reason: status === 'error' ? 'source unavailable' : undefined,
    findings: status === 'findings' ? [{ platform: 'ios', package: 'apple/swift-protobuf',
      advisory: 'release-1.39.0', versions: ['1.38.1'], severity, source: 'https://github.com/apple/swift-protobuf/releases' }] : [] });
  input.rawReport = JSON.stringify(report);
  importSecurityObservation(owner, input);
}

it('defers releases, disposition expiry, source failure and recovery to check without losing durable facts', () => {
  const { owner, submitted, notify } = setup();
  observe(owner, 0);
  expect(notify(now)[0]).toMatchObject({ route: 'centralized-check', enqueue: null,
    delivery: { status: 'deferred-to-check' } });
  const finding = projectSecurityOwner(owner, now).findings.find(row => row.active);
  setSecurityDisposition(owner, { finding: finding.key, versionDigest: finding.versionDigest,
    riskDigest: finding.riskDigest, status: 'investigating', reason: 'Reviewed in centralized check',
    expiresAt: new Date(now + 1000).toISOString() }, now);
  notify(now + 2000);
  observe(owner, 3000, 'info', 'error');
  notify(now + 3000);
  expect(projectSecurityOwner(owner, now + 3000).findings.find(row => row.active).key).toBe(finding.key);
  expect(projectSecurityOwner(owner, now + 3000).sources.some(row => row.status === 'error')).toBe(true);
  observe(owner, 4000);
  notify(now + 4000);
  expect(submitted).toEqual([]);
  const history = readOwnerRecords(path.join(owner, 'notifications'));
  expect(history.flatMap(row => row.changes).some(row => row.current?.disposition === 'expired-or-evidence-changed')).toBe(true);
  expect(history.flatMap(row => row.changes).some(row => row.current?.status === 'error')).toBe(true);
  expect(history.flatMap(row => row.changes).some(row => row.state === 'recovered')).toBe(true);
  expect(projectSecurityOwner(owner, now + 4000).overallStatus).toBe('incomplete');
});

it('alerts on a new high risk and escalation, but not bookkeeping expiry or recovery', () => {
  const { owner, submitted, notify } = setup();
  observe(owner, 0);
  notify(now);
  observe(owner, 1000, 'high');
  notify(now + 1000);
  const finding = projectSecurityOwner(owner, now + 1000).findings.find(row => row.active);
  setSecurityDisposition(owner, { finding: finding.key, versionDigest: finding.versionDigest,
    riskDigest: finding.riskDigest, status: 'investigating', reason: 'Urgent review owned',
    expiresAt: new Date(now + 2000).toISOString() }, now + 1000);
  notify(now + 3000);
  expect(submitted).toHaveLength(1);
  observe(owner, 4000, 'critical');
  notify(now + 4000);
  expect(submitted).toHaveLength(2);
  observe(owner, 5000, 'critical', 'clean');
  notify(now + 5000);
  expect(submitted).toHaveLength(2);
  expect(projectSecurityOwner(owner, now + 5000).findings.some(row => row.active)).toBe(false);
});
