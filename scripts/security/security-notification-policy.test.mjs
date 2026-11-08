// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { digest } from './security-inputs.mjs';
import { notificationObservation } from './security-notification-fixture.mjs';
import { readOwnerRecords, writeOwnerRecord } from './security-owner-files.mjs';
import { importSecurityObservation, projectSecurityOwner } from './security-owner.mjs';
import { notifySecurityOwner } from './security-notifications.mjs';
import { securityNotificationSignals } from './security-notification-signals.mjs';

const roots = [];
const now = Date.now();
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function setup() {
  const base = path.resolve('.tmp/artifacts/T674-6');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'notification-'));
  roots.push(root);
  const codexHome = path.join(root, 'codex');
  mkdirSync(path.join(codexHome, 'local-tools/desktop-handoff'), { recursive: true });
  writeFileSync(path.join(codexHome, 'local-tools/desktop-handoff/config.json'), '{"maxPromptLength":6000}');
  return { owner: path.join(root, 'owner'), codexHome, now, batchQuietMs: 0 };
}
const finding = (platform, packageName, advisory) => ({ platform, package: packageName,
  advisory, severity: 'info', versions: ['1.0'], source: 'https://example.org/security' });
const routine = finding('android', 'android-sdk', 'release-review-platform-tools-37.0.1');
const boundary = finding('ios', 'foliole/swift-native', 'coverage-review-required');
function observe(options, offset, findings = [], source) {
  const input = notificationObservation(now + offset, { id: offset + 1, status: 'clean' });
  const report = JSON.parse(input.rawReport);
  const check = report.coverage.find(row => row.id === 'swift-native').checks.find(row => row.route === 'official-review');
  Object.assign(check, { status: findings.length ? 'findings' : 'clean', findings });
  if (source) Object.assign(report.coverage.find(row => row.id === 'swift-native').checks
    .find(row => row.route === 'resolution'), source);
  input.rawReport = JSON.stringify(report);
  importSecurityObservation(options.owner, input);
}
const history = options => readOwnerRecords(path.join(options.owner, 'notifications'));
const notify = (options, offset = 0) => notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + offset });
function legacyFinding(row) {
  const key = digest(`official-review|${row.platform}|${row.package}|${row.advisory}`);
  return [`finding:${key}`, { kind: 'finding', advisory: row.advisory,
    package: row.package, platform: row.platform, versions: row.versions, severity: row.severity,
    riskDigest: digest(JSON.stringify({ versions: row.versions, severity: row.severity })), disposition: 'unassessed' }];
}

it('retains ordinary releases and fixed coverage boundaries without creating investigation events', () => {
  const options = setup();
  observe(options, 0, [routine, boundary]);
  expect(notify(options)).toHaveLength(0);
  const state = projectSecurityOwner(options.owner, now);
  expect(state.findings.filter(row => row.active)).toHaveLength(2);
  expect(state.overallStatus).toBe('incomplete');
});

it('keeps vendor releases, info security risks and unknown identities in the same live pipeline', () => {
  const options = setup();
  const risks = [finding('android', 'sqlcipher', 'release-review-v4.21.0'),
    finding('android', 'jdk', 'distrusted-root-1234'),
    finding('ios', 'apple/ios', 'security-release-27.1'),
    finding('ios', 'foliole/new-asset', 'coverage-review-required')];
  observe(options, 0, [routine, boundary, ...risks]);
  notify(options);
  const delivered = history(options).flatMap(row => row.changes).map(row => row.current?.advisory);
  expect(delivered.sort()).toEqual(risks.map(row => row.advisory).sort());
  expect(projectSecurityOwner(options.owner, now).findings.filter(row => row.active)).toHaveLength(6);
});

it('retains device bulletin observations without opening work and still delivers actionable risks', () => {
  const options = setup();
  const bulletin = finding('android', 'android-os-webview', 'device-review-2026-11-01-157.0.8103.30');
  observe(options, 0, [bulletin]);
  expect(notify(options)).toHaveLength(0);
  expect(projectSecurityOwner(options.owner, now).findings.filter(row => row.active)).toHaveLength(1);
  observe(options, 1000, [{ ...bulletin, severity: 'high' },
    finding('android', 'android-os-webview', 'GHSA-example-applicable'),
    finding('android', 'android-os-webview', 'device-review-unknown')]);
  notify(options, 1000);
  const changes = history(options).flatMap(row => row.changes);
  expect(changes.map(row => row.current?.advisory).sort()).toEqual([
    bulletin.advisory, 'GHSA-example-applicable', 'device-review-unknown'
  ].sort());
  expect(projectSecurityOwner(options.owner, now + 1000).overallStatus).toBe('incomplete');
});

it('compares one source continuously from missing to error, recovery and recurrence', () => {
  const options = setup();
  observe(options, 0, [], { status: 'unsupported', reason: 'required-observation-missing' });
  notify(options);
  observe(options, 1000, [], { status: 'error', reason: 'resolver unavailable' });
  notify(options, 1000);
  observe(options, 2000);
  notify(options, 2000);
  observe(options, 3000, [], { status: 'error', reason: 'resolver unavailable' });
  notify(options, 3000);
  const records = history(options).sort((a, b) => a.sequence - b.sequence);
  expect(records.map(row => row.changes.length)).toEqual([1, 1, 1, 1]);
  expect(records[1].changes[0]).toMatchObject({ previous: { status: 'missing' }, current: { status: 'error' } });
  expect(records[2].changes[0]).toMatchObject({ state: 'recovered', current: null });
});

it('normalizes a previously delivered legacy baseline without inventing recovery events', () => {
  const options = setup();
  observe(options, 0, [routine, boundary]);
  const id = 'a'.repeat(64);
  writeOwnerRecord(path.join(options.owner, 'notifications'), { schemaVersion: 1, id, sequence: 1,
    signals: Object.fromEntries([legacyFinding(routine), legacyFinding(boundary)]),
    changes: [], event: { id: `security-${id}`, dedupeKey: id } });
  writeOwnerRecord(path.join(options.owner, 'notification-enqueues'), { schemaVersion: 1, id });
  expect(notify(options)).toHaveLength(1);
  expect(history(options)[0].changes).toEqual([]);
});

it('keeps a legacy pending batch deadline and original intent across a separate process', () => {
  const options = { ...setup(), batchQuietMs: 300_000 };
  const risk = { ...finding('android', 'jdk', 'distrusted-root-1234'), severity: 'high' };
  observe(options, 0, [routine, risk]);
  const signals = Object.fromEntries([legacyFinding(routine), legacyFinding(risk)]);
  const id = 'b'.repeat(64);
  writeOwnerRecord(path.join(options.owner, 'notification-batches'), { schemaVersion: 1, id,
    group: 'android', baselineId: null, sequence: 1, active: true, signals,
    firstObservedAt: now, lastChangedAt: now });
  const code = "import {notifySecurityOwner} from './scripts/security/security-notifications.mjs';"
    + 'notifySecurityOwner(process.argv[1],process.cwd(),{now:Number(process.argv[2])});';
  execFileSync(process.execPath, ['--input-type=module', '-e', code, options.owner, String(now + 300_000)],
    { env: { ...process.env, CODEX_HOME: options.codexHome, ELECTRON_RUN_AS_NODE: '1' } });
  const records = history(options);
  expect(records).toHaveLength(1);
  expect(records[0].batchId).toBe(id);
  expect(records[0].changes).toHaveLength(1);
  expect(records[0].changes[0].current.advisory).toBe(risk.advisory);
  const event = JSON.parse(readFileSync(path.join(options.codexHome,
    'local-tools/desktop-handoff/inbox', `${records[0].event.id}.json`)));
  expect(event.prompt).toContain('investigation only');
});

it('retries an immutable legacy notification without replacing its event or inventing a recovery', () => {
  const options = setup();
  observe(options, 0, [{ ...routine, severity: 'high' }]);
  const id = 'c'.repeat(64);
  const event = { id: `security-${id}`, dedupeKey: id, prompt: 'Original review intent', title: 'Original batch' };
  writeOwnerRecord(path.join(options.owner, 'notifications'), { schemaVersion: 1, id, sequence: 1,
    signals: securityNotificationSignals(projectSecurityOwner(options.owner, now)),
    changes: [{ key: 'original', current: { kind: 'finding', severity: 'high' } }], event });
  const submitted = [];
  const submit = value => {
    submitted.push(value);
    if (submitted.length === 1) throw new Error('temporary transport failure');
    return { eventId: value.id };
  };
  expect(() => notifySecurityOwner(options.owner, process.cwd(), { ...options, submit })).toThrow('temporary transport failure');
  notifySecurityOwner(options.owner, process.cwd(), { ...options, submit });
  expect(submitted).toEqual([event, event]);
  expect(history(options)).toHaveLength(1);
});
