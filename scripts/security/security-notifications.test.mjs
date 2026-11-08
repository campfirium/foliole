// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { importSecurityObservation } from './security-owner.mjs';
import { notifySecurityMonitor } from './security-monitor-notifications.mjs';
import { notificationObservation } from './security-notification-fixture.mjs';
import { notifySecurityOwner, securityNotificationStatus } from './security-notifications.mjs';
import { handoffRuntime } from './security-notification-transport.mjs';
import { readOwnerRecords } from './security-owner-files.mjs';

const roots = [];
const now = Date.now();
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const base = path.resolve('.tmp/artifacts/T674/notification-tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'run-'));
  roots.push(root);
  const codexHome = path.join(root, 'codex');
  const runtime = handoffRuntime(codexHome);
  mkdirSync(runtime, { recursive: true });
  writeFileSync(path.join(runtime, 'config.json'), JSON.stringify({ maxPromptLength: 6000 }));
  return { owner: path.join(root, 'owner'), codexHome, now, batchQuietMs: 0 };
}
function fault(owner, status = 'error', offset = 0) {
  importSecurityObservation(owner, notificationObservation(now + offset,
    { id: offset + 1, status: status === 'error' ? 'findings' : 'clean' }));
}
function child(code, args, options) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', code, ...args],
    { encoding: 'utf8', env: { ...process.env, CODEX_HOME: options.codexHome, ELECTRON_RUN_AS_NODE: '1' } });
}
const notifyChild = "import { notifySecurityOwner } from './scripts/security/security-notifications.mjs'; notifySecurityOwner(process.argv[1], process.cwd());";

it('durably enqueues through the existing inbox contract, stays quiet on repeats and resumes in a separate process', () => {
  const options = setup();
  fault(options.owner);
  const [first] = notifySecurityOwner(options.owner, process.cwd(), options);
  expect(first.enqueue.eventId).toBeTruthy();
  expect(first.delivery.status).toBe('queued');
  const event = JSON.parse(readFileSync(first.enqueue.receipt.eventFile, 'utf8'));
  expect(event.dedupeKey).toBe(`foliole:security:${first.id}`);
  expect(event.prompt).toContain('investigation only');
  child(notifyChild, [options.owner], options);
  expect(securityNotificationStatus(options.owner, options.codexHome)).toHaveLength(1);
  fault(options.owner, 'clean', 1000);
  notifySecurityOwner(options.owner, process.cwd(), options);
  fault(options.owner, 'error', 2000);
  notifySecurityOwner(options.owner, process.cwd(), options);
  const history = readOwnerRecords(path.join(options.owner, 'notifications')).sort((a, b) => a.sequence - b.sequence);
  expect(history.map(record => record.changes[0].state)).toEqual(['actionable', 'recovered', 'actionable']);
  expect(securityNotificationStatus(options.owner, options.codexHome).map(row => row.delivery.status))
    .toEqual(['queued', 'deferred-to-check', 'queued']);
  expect(new Set(history.map(record => record.event.dedupeKey)).size).toBe(3);
});

it('retains intent and leaves enqueue unacknowledged on submission failure, then retries the same episode', () => {
  const options = setup();
  fault(options.owner);
  const skillLink = path.join(handoffRuntime(options.codexHome), 'config.json');
  renameSync(skillLink, `${skillLink}.disabled`);
  expect(() => notifySecurityOwner(options.owner, process.cwd(), options)).toThrow();
  const [failed] = securityNotificationStatus(options.owner, options.codexHome);
  expect(failed.enqueue).toBeNull();
  expect(failed.enqueueError.error).toContain('ENOENT');
  renameSync(`${skillLink}.disabled`, skillLink);
  const [retried] = notifySecurityOwner(options.owner, process.cwd(), options);
  expect(retried.id).toBe(failed.id);
  expect(retried.delivery.status).toBe('queued');
});

it('replays a real process crash after enqueue before checkpoint with the identical event identity', () => {
  const options = setup();
  fault(options.owner);
  const crashing = "import { notifySecurityOwner } from './scripts/security/security-notifications.mjs'; notifySecurityOwner(process.argv[1], process.cwd(), { batchQuietMs: 0, beforeCheckpoint: () => process.exit(73) });";
  expect(() => child(crashing, [options.owner], options)).toThrow();
  const [before] = securityNotificationStatus(options.owner, options.codexHome);
  expect(before.enqueue).toBeNull();
  expect(before.delivery.status).toBe('queued');
  child(notifyChild, [options.owner], options);
  const [after] = securityNotificationStatus(options.owner, options.codexHome);
  expect(after.id).toBe(before.id);
  expect(after.enqueue.eventId).toBe(`security-${before.id}`);
  expect(securityNotificationStatus(options.owner, options.codexHome)).toHaveLength(1);
});

// Daemon output is an external boundary here; real daemon qualification is recorded separately.
it.each(['expired-undelivered', 'thread-created-delivery-failed', 'thread-open-requested', 'deduped'])(
  'projects the transport archive %s without overstating delivery', suffix => {
    const options = setup();
    fault(options.owner);
    const [first] = notifySecurityOwner(options.owner, process.cwd(), options);
    const runtime = handoffRuntime(options.codexHome);
    const directory = suffix === 'expired-undelivered' ? 'dead' : 'done';
    const archive = path.join(runtime, directory, '2026-11-01', `security-${first.id}.${suffix}.json`);
    mkdirSync(path.dirname(archive), { recursive: true });
    renameSync(first.enqueue.receipt.eventFile, archive);
    const [terminal] = securityNotificationStatus(options.owner, options.codexHome);
    const expected = { 'expired-undelivered': 'dead-letter', 'thread-created-delivery-failed': 'desktop-open-failed',
      'thread-open-requested': 'thread-open-requested', deduped: 'deduplicated-unverified' };
    expect(terminal.delivery.status).toBe(expected[suffix]);
    expect(terminal.delivery.evidence).toBe(archive);
    notifySecurityOwner(options.owner, process.cwd(), options);
    expect(existsSync(first.enqueue.receipt.eventFile)).toBe(false);
  });

it('delivers finding version changes and source failure/recovery through continuous durable owner state', () => {
  const options = setup();
  const observe = (offset, input) => {
    importSecurityObservation(options.owner, notificationObservation(now + offset, input));
    return notifySecurityOwner(options.owner, process.cwd(), { ...options, now: now + offset });
  };
  expect(observe(0, {})).toHaveLength(1);
  expect(observe(1000, { id: 2 })).toHaveLength(1);
  expect(observe(2000, { id: 3, version: '1.1.0' })).toHaveLength(2);
  expect(observe(3000, { id: 4, status: 'error' })).toHaveLength(3);
  expect(observe(4000, { id: 5, status: 'clean' })).toHaveLength(4);
  const history = readOwnerRecords(path.join(options.owner, 'notifications')).sort((a, b) => a.sequence - b.sequence);
  expect(history[2].signals[Object.keys(history[2].signals).find(key => key.startsWith('finding:'))].versions).toEqual(['1.1.0']);
  expect(history[3].changes.some(change => change.state === 'recovered' && change.key.startsWith('finding:'))).toBe(true);
  expect(history[3].changes.some(change => change.state === 'recovered' && change.key.startsWith('source:'))).toBe(true);
  expect(Object.keys(history[3].signals)).toEqual([]);
});

it('routes existing monitor errors and recovery without needing a repository commit', () => {
  const options = setup();
  const workspace = path.join(options.owner, 'workspace');
  const errors = [{ source: 'github-alerts', detail: 'list', message: 'permission denied' }];
  expect(notifySecurityMonitor(workspace, errors, options)).toHaveLength(1);
  expect(notifySecurityMonitor(workspace, errors, options)).toHaveLength(1);
  expect(notifySecurityMonitor(workspace, [], { ...options, now: now + 1000 })).toHaveLength(2);
  expect(notifySecurityMonitor(workspace, errors, { ...options, now: now + 2000 })).toHaveLength(3);
});
