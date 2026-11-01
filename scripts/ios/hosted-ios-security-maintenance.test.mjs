// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { notificationObservation } from '../security/security-notification-fixture.mjs';
import { runHostedIosSecurityMaintenance } from './hosted-ios-security-maintenance.mjs';
import { iosMaintenanceChecks } from './ios-security-maintenance.mjs';

it('updates the existing artifact with iOS checks and retains scheduled identity while rejecting another candidate', async () => {
  const now = Date.now();
  const root = process.cwd();
  const parent = path.resolve('.tmp/artifacts/T674-3/hosted-tests');
  mkdirSync(parent, { recursive: true });
  const output = mkdtempSync(path.join(parent, 'run-'));
  const expected = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const base = JSON.parse(notificationObservation(now, { status: 'clean' }).rawReport);
  base.snapshot.candidate.revision = expected;
  base.snapshot.environments = {};
  for (const asset of base.coverage) for (const check of asset.checks) check.reason = 'required-observation-missing';
  base.hosted = { target: expected, runId: '123', runAttempt: '1' };
  const receipt = { candidate: base.snapshot.candidate, checkedAt: new Date(now).toISOString(), errors: [],
    inventory: { status: 'lock-evidence', graphs: {}, inputs: {} }, scanner: { status: 'clean', findings: [], errors: [] },
    official: { errors: [], findings: [], sources: [], packages: [], gaps: [] }, environment: { tools: {}, components: {} } };
  receipt.checks = iosMaintenanceChecks(receipt);
  const file = path.join(output, 'coverage.json');
  writeFileSync(file, JSON.stringify(base));
  try {
    await runHostedIosSecurityMaintenance({ root, output, expected, collect: async () => receipt });
    const persisted = JSON.parse(readFileSync(file, 'utf8'));
    expect(persisted.hosted).toEqual(base.hosted);
    expect(persisted.ios.candidate.revision).toBe(expected);
    expect(persisted.overallStatus).toBe('incomplete');
    base.snapshot.candidate.revision = 'f'.repeat(40);
    writeFileSync(file, JSON.stringify(base));
    await expect(runHostedIosSecurityMaintenance({ root, output, expected })).rejects.toThrow('candidate mismatch');
  } finally { rmSync(output, { recursive: true, force: true }); }
});
