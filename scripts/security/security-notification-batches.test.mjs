// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { notificationObservation } from './security-notification-fixture.mjs';
import { importSecurityObservation, projectSecurityOwner } from './security-owner.mjs';
import { pendingSecurityNotificationBatches } from './security-notification-batches.mjs';
import { securityNotificationSignals } from './security-notification-signals.mjs';
import { notifySecurityOwner, securityNotificationStatus } from './security-notifications.mjs';
import { readOwnerRecords, writeOwnerRecord } from './security-owner-files.mjs';

const roots = [];
const now = Date.now();
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function setup() {
  const base = path.resolve('.tmp/artifacts/T674-4');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'batch-'));
  roots.push(root);
  const codexHome = path.join(root, 'codex');
  const runtime = path.join(codexHome, 'local-tools/desktop-handoff');
  mkdirSync(runtime, { recursive: true });
  writeFileSync(path.join(runtime, 'config.json'), JSON.stringify({ maxPromptLength: 6000 }));
  return { owner: path.join(root, 'owner'), codexHome, now };
}
function observe(options, offset, android = '1.0', ios = '1.0') {
  const input = notificationObservation(now + offset, { id: offset + 1, status: 'clean' });
  const report = JSON.parse(input.rawReport);
  for (const [asset, platform, version] of [['gradle', 'android', android], ['swift-native', 'ios', ios]]) {
    const check = report.coverage.find(row => row.id === asset).checks.find(row => row.route === 'official-review');
    check.status = version === 'unavailable' ? 'error' : version ? 'findings' : 'clean';
    check.reason = version === 'unavailable' ? 'source unavailable' : undefined;
    check.findings = version && version !== 'unavailable' ? [{ platform, package: `${platform}/tool`, advisory: 'review-required',
      versions: [version], severity: 'info', source: 'https://example.org/security' }] : [];
  }
  input.rawReport = JSON.stringify(report);
  importSecurityObservation(options.owner, input);
  return notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + offset });
}
const history = options => readOwnerRecords(path.join(options.owner, 'notifications'));

it('debounces real Android/iPhone owner imports independently and emits only final facts for each batch', () => {
  const options = setup();
  expect(observe(options, 0)).toHaveLength(0);
  expect(observe(options, 60_000, '1.1', '1.0')).toHaveLength(0);
  expect(observe(options, 120_000, '1.1', '1.2')).toHaveLength(0);
  expect(pendingSecurityNotificationBatches(options.owner).map(batch => batch.group)).toEqual(['android', 'ios']);
  expect(notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + 360_000 })).toHaveLength(1);
  expect(notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + 420_000 })).toHaveLength(2);
  const records = history(options);
  expect(new Set(records.map(record => record.group))).toEqual(new Set(['android', 'ios']));
  for (const record of records) {
    const expected = record.group === 'android' ? ['1.1'] : ['1.2'];
    expect(record.changes).toHaveLength(1);
    expect(record.changes[0].current.versions).toEqual(expected);
    const event = JSON.parse(readFileSync(path.join(options.codexHome,
      'local-tools/desktop-handoff/inbox', `${record.event.id}.json`), 'utf8'));
    expect(event.title).toContain(record.group === 'android' ? 'Android' : 'iPhone');
    expect(event.prompt).toContain('investigation only');
    expect(event.prompt).toContain(record.group);
  }
  expect(observe(options, 450_000, '1.1', '1.2')).toHaveLength(2);
  expect(pendingSecurityNotificationBatches(options.owner)).toEqual([]);
});

it('keeps debounce state across a new process and cancels changes that recover before delivery', () => {
  const options = setup();
  observe(options, 0);
  observe(options, 60_000, null, '1.1');
  const code = "import { notifySecurityOwner } from './scripts/security/security-notifications.mjs'; notifySecurityOwner(process.argv[1], process.cwd(), { now: Number(process.argv[2]) });";
  execFileSync(process.execPath, ['--input-type=module', '-e', code, options.owner, String(now + 360_000)],
    { env: { ...process.env, CODEX_HOME: options.codexHome, ELECTRON_RUN_AS_NODE: '1' } });
  expect(history(options)).toHaveLength(1);
  expect(history(options)[0].group).toBe('ios');
  expect(securityNotificationStatus(options.owner, options.codexHome)[0].delivery.status).toBe('queued');
});

it('flushes continuously changing groups at the PR maximum wait and starts a later distinct batch', () => {
  const options = setup();
  observe(options, 0, '1.0', null);
  for (let minute = 4; minute <= 28; minute += 4) observe(options, minute * 60_000, `1.${minute}`, null);
  expect(history(options)).toHaveLength(0);
  observe(options, 30 * 60_000, '1.30', null);
  expect(history(options)).toHaveLength(1);
  observe(options, 31 * 60_000, '1.31', null);
  expect(history(options)).toHaveLength(1);
  notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + 36 * 60_000 });
  expect(history(options)).toHaveLength(2);
  expect(new Set(history(options).map(record => record.event.dedupeKey)).size).toBe(2);
});

it('groups source failure and recovery with their own platform while retaining previously found facts', () => {
  const options = setup();
  observe(options, 0);
  notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + 300_000 });
  observe(options, 360_000, 'unavailable');
  notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + 660_000 });
  let records = history(options).sort((a, b) => a.sequence - b.sequence);
  expect(records).toHaveLength(3);
  expect(records[2].group).toBe('android');
  expect(records[2].changes.some(change => change.current?.status === 'error')).toBe(true);
  expect(Object.values(records[2].signals).some(signal => signal.advisory === 'review-required')).toBe(true);
  observe(options, 720_000);
  notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + 1_020_000 });
  records = history(options).sort((a, b) => a.sequence - b.sequence);
  expect(records).toHaveLength(4);
  expect(records[3].group).toBe('android');
  expect(records[3].changes).toEqual([expect.objectContaining({ state: 'recovered', current: null })]);
});

it('uses existing ungrouped notifications as the baseline without replaying old findings', () => {
  const options = setup();
  observe(options, 0);
  const id = 'f'.repeat(64);
  const signals = securityNotificationSignals(projectSecurityOwner(options.owner, now));
  const event = { id: `security-${id}`, dedupeKey: `foliole:security:${id}` };
  writeOwnerRecord(path.join(options.owner, 'notifications'), { schemaVersion: 1, id, sequence: 1,
    checkedAt: new Date(now).toISOString(), signals, changes: [], event });
  writeOwnerRecord(path.join(options.owner, 'notification-enqueues'), { schemaVersion: 1, id, eventId: event.id });
  notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + 300_000 });
  expect(history(options)).toHaveLength(1);
  expect(pendingSecurityNotificationBatches(options.owner)).toEqual([]);
  observe(options, 360_000, '1.1');
  notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + 660_000 });
  const records = history(options).sort((a, b) => a.sequence - b.sequence);
  expect(records).toHaveLength(2);
  expect(records[1].group).toBe('android');
  expect(records[1].changes[0].previous.versions).toEqual(['1.0']);
  expect(records[1].changes[0].current.versions).toEqual(['1.1']);
});
