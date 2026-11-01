// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { notificationObservation } from '../security/security-notification-fixture.mjs';
import { importSecurityObservation, projectSecurityOwner } from '../security/security-owner.mjs';
import { notifySecurityOwner, securityNotificationStatus } from '../security/security-notifications.mjs';
import { handoffRuntime } from '../security/security-notification-transport.mjs';
import { collectAndroidOfficialSecurity } from './android-official-security.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const inventory = (gradle = '8.14.3', sqlcipher = '4.17.0') => ({ gradleVersion: gradle,
  configurations: [{ modules: [{ group: 'net.zetetic', name: 'sqlcipher-android', version: sqlcipher }] }] });
const fetchSource = async url => new globalThis.Response(JSON.stringify(url.includes('gradle/gradle') ? [{
  ghsa_id: 'GHSA-mvvg-497x-hmj8', severity: 'high', published_at: '2026-10-07T21:51:52Z',
  html_url: 'https://github.com/gradle/gradle/security/advisories/GHSA-mvvg-497x-hmj8',
  vulnerabilities: [{ vulnerable_version_range: '< 8.14.6, 9.0.0 to 9.8.0', patched_versions: '8.14.6, 9.8.1' }]
}] : [{ tag_name: 'v4.19.0', html_url: 'https://github.com/sqlcipher/sqlcipher/releases/tag/v4.19.0',
  published_at: '2026-09-08T14:31:26Z', body: 'two security issues: hexkey and sqlcipher_export' }]));

it('finds vendor issues missed by Maven identities and distinguishes fixed versions', async () => {
  const rows = await collectAndroidOfficialSecurity(inventory(), { fetchImpl: fetchSource });
  expect(rows.map(row => row.findings.length)).toEqual([1, 2]);
  expect(rows.flatMap(row => row.findings).every(row => row.versions.length === 1)).toBe(true);
  const fixed = await collectAndroidOfficialSecurity(inventory('8.14.6', '4.20.0'), { fetchImpl: fetchSource });
  expect(fixed.map(row => row.status)).toEqual(['clean', 'clean']);
});

it.each([
  async () => new globalThis.Response('[]'),
  async () => new globalThis.Response('{}'),
  async () => new globalThis.Response('unavailable', { status: 503 }),
  async () => { throw new Error('source unavailable'); }
])('never reports unreadable, empty or malformed official sources as clean', async fetchImpl => {
  const rows = await collectAndroidOfficialSecurity(inventory(), { fetchImpl });
  expect(rows.map(row => row.status)).toEqual(['error', 'error']);
});

it('persists actual vendor results through failure, restart, recovery and repeated failure to the existing inbox', async () => {
  const base = path.resolve('.tmp/artifacts/T674-2/tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'run-'));
  roots.push(root);
  const owner = path.join(root, 'owner');
  const codexHome = path.join(root, 'codex');
  mkdirSync(handoffRuntime(codexHome), { recursive: true });
  writeFileSync(path.join(handoffRuntime(codexHome), 'config.json'), '{}');
  const now = Date.now();
  const observe = async (offset, fetchImpl = fetchSource, versions = inventory()) => {
    const input = notificationObservation(now + offset, { id: offset, status: 'clean' });
    const report = JSON.parse(input.rawReport);
    const rows = await collectAndroidOfficialSecurity(versions, { fetchImpl, now: now + offset });
    for (const row of rows) {
      const asset = report.coverage.find(value => value.id === row.asset);
      asset.checks = asset.checks.map(check => check.route === 'vendor-notices'
        ? { ...row, candidate: report.snapshot.candidate } : check);
    }
    importSecurityObservation(owner, { ...input, rawReport: JSON.stringify(report) });
    return notifySecurityOwner(owner, process.cwd(), { codexHome, now: now + offset, batchQuietMs: 0 });
  };
  expect(await observe(0)).toHaveLength(1);
  expect(projectSecurityOwner(owner).findings.filter(row => row.active)).toHaveLength(3);
  expect(await observe(1000)).toHaveLength(1);
  const failure = async () => new globalThis.Response('unavailable', { status: 503 });
  expect(await observe(2000, failure)).toHaveLength(2);
  expect(projectSecurityOwner(owner).findings.filter(row => row.active)).toHaveLength(3);
  execFileSync(process.execPath, ['--input-type=module', '-e',
    "import {notifySecurityOwner} from './scripts/security/security-notifications.mjs'; notifySecurityOwner(process.argv[1],process.cwd());", owner],
  { env: { ...process.env, CODEX_HOME: codexHome }, encoding: 'utf8' });
  expect(securityNotificationStatus(owner, codexHome)).toHaveLength(2);
  expect(await observe(3000)).toHaveLength(3);
  expect(await observe(4000, failure)).toHaveLength(4);
  expect(await observe(5000, fetchSource, inventory('8.14.6', '4.20.0'))).toHaveLength(5);
  expect(projectSecurityOwner(owner).findings.filter(row => row.active)).toHaveLength(0);
  const history = securityNotificationStatus(owner, codexHome);
  expect(history.every(row => row.delivery.status === 'queued')).toBe(true);
  expect(new Set(history.map(row => row.id)).size).toBe(5);
  expect(JSON.parse(readFileSync(history[0].enqueue.receipt.eventFile)).prompt).toContain('investigation only');
});
