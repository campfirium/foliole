// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { notificationObservation } from '../security/security-notification-fixture.mjs';
import { importSecurityObservation, projectSecurityOwner } from '../security/security-owner.mjs';
import { notifySecurityOwner, securityNotificationStatus } from '../security/security-notifications.mjs';
import { handoffRuntime } from '../security/security-notification-transport.mjs';
import { readOwnerRecords } from '../security/security-owner-files.mjs';
import { collectIosOfficialSecurity } from './ios-official-security.mjs';
import { iosMaintenanceChecks } from './ios-security-maintenance.mjs';
import { mergeIosSecurityCoverage } from './ios-security-coverage.mjs';
import { startOfficialPublisher } from './ios-security-test-support.mjs';

async function setupOwnerFixture() {
  const now = Date.now();
  const parent = path.resolve('.tmp/artifacts/T674-3/owner-integration');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'run-'));
  const publisher = await startOfficialPublisher(now);
  const owner = path.join(root, 'owner');
  const codexHome = path.join(root, 'codex');
  const runtime = handoffRuntime(codexHome);
  mkdirSync(runtime, { recursive: true });
  writeFileSync(path.join(runtime, 'config.json'), JSON.stringify({ maxPromptLength: 6000 }));
  const source = notificationObservation(now, { status: 'clean' });
  const baseline = JSON.parse(source.rawReport);
  baseline.snapshot.environments = {};
  for (const asset of baseline.coverage) {
    for (const check of asset.checks) {
      check.reason = 'required-observation-missing';
    }
  }
  let sequence = 0;
  const observe = async (version = '4.17.0') => {
    const timestamp = now + sequence++ * 1000;
    const official = await collectIosOfficialSecurity({ pins: [{ identity: 'sqlcipher.swift',
      url: 'https://github.com/sqlcipher/SQLCipher.swift.git', version, revision: 'a'.repeat(40) }],
    output: path.join(root, `source-${sequence}`), now: timestamp, fetchSource: publisher.fetchSource });
    const receipt = { candidate: baseline.snapshot.candidate, checkedAt: new Date(timestamp).toISOString(),
      official, scanner: { findings: [], errors: [], status: 'clean' }, errors: [],
      inventory: { status: 'resolved', graphs: {}, inputs: {} }, environment: { tools: {}, components: {} } };
    receipt.checks = iosMaintenanceChecks(receipt);
    const coverage = mergeIosSecurityCoverage(baseline, receipt, timestamp);
    const input = { ...source, rawReport: JSON.stringify(coverage), now: timestamp,
      envelope: { ...source.envelope, artifactId: sequence } };
    importSecurityObservation(owner, input);
    notifySecurityOwner(owner, process.cwd(), { now: timestamp, codexHome });
    return input;
  };
  const notifications = () => readOwnerRecords(path.join(owner, 'notifications'));
  const vendor = () => projectSecurityOwner(owner, now + 60_000).findings.find(row =>
    row.advisory === 'sqlcipher-4.19.0-export-hexkey');
  return { now, root, publisher, owner, codexHome, observe, notifications, vendor };
}

it('carries vendor discovery through source faults, process restart, recovery and recurrence using the existing owner/inbox', async () => {
  const { now, root, publisher, owner, codexHome, observe, notifications, vendor } = await setupOwnerFixture();
  try {
    await observe();
    expect(vendor()).toMatchObject({ active: true, versions: ['4.17.0'], severity: 'low' });
    expect(notifications()).toHaveLength(1);
    const [delivery] = securityNotificationStatus(owner, codexHome);
    expect(delivery.delivery.status).toBe('queued');
    expect(JSON.parse(readFileSync(delivery.enqueue.receipt.eventFile, 'utf8')).prompt).toContain(delivery.id);
    expect(notifications()[0].signals).toEqual(expect.objectContaining({
      [Object.keys(notifications()[0].signals).find(key => notifications()[0].signals[key].advisory === 'sqlcipher-4.19.0-export-hexkey')]: expect.objectContaining({ package: 'sqlcipher/sqlcipher' }) }));
    await observe();
    expect(notifications()).toHaveLength(1);
    publisher.state.failure = true;
    await observe();
    expect(notifications()).toHaveLength(2);
    expect(vendor().active).toBe(true);
    await observe();
    expect(notifications()).toHaveLength(2);
    execFileSync(process.execPath, ['--input-type=module', '-e',
      "import{notifySecurityOwner}from'./scripts/security/security-notifications.mjs';notifySecurityOwner(process.argv[1],process.cwd());", owner],
    { encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome, ELECTRON_RUN_AS_NODE: '1' } });
    expect(notifications()).toHaveLength(2);
    publisher.state.failure = false;
    await observe();
    expect(notifications()).toHaveLength(3);
    publisher.state.failure = true;
    await observe();
    expect(notifications()).toHaveLength(4);
    publisher.state.failure = false;
    publisher.state.malformed = true;
    await observe();
    expect(notifications()).toHaveLength(5);
    expect(vendor().active).toBe(true);
    publisher.state.malformed = false;
    const upgraded = await observe('4.20.0');
    expect(vendor().active).toBe(false);
    expect(projectSecurityOwner(owner).findings.some(row => row.active && row.advisory === 'coverage-review-required')).toBe(true);
    const expired = JSON.parse(upgraded.rawReport);
    expired.generatedAt = new Date(now - 27 * 3_600_000).toISOString();
    expect(() => importSecurityObservation(owner, { ...upgraded, rawReport: JSON.stringify(expired), now: now + 60_000 })).toThrow('Expired');
    expect(projectSecurityOwner(owner, now + 193 * 3_600_000).sources.some(row => row.stale)).toBe(true);
  } finally {
    await publisher.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
