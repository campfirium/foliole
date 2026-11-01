// @vitest-environment node
import { expect, it } from 'vitest';
import { notificationObservation } from '../security/security-notification-fixture.mjs';
import { digest } from '../security/security-inputs.mjs';
import { iosMaintenanceChecks } from './ios-security-maintenance.mjs';
import { mergeIosSecurityCoverage } from './ios-security-coverage.mjs';
import { verifyTrivyArchive } from './ios-security-trivy.mjs';

function reports(now) {
  const base = JSON.parse(notificationObservation(now, { status: 'clean' }).rawReport);
  base.snapshot.environments = {};
  for (const asset of base.coverage) {
    base.snapshot.environments[asset.id] = 'original-environment';
    for (const check of asset.checks) Object.assign(check, { environment: 'original-environment',
      checkedAt: new Date(now).toISOString(), source: 'original-source', findings: [] });
  }
  const receipt = { candidate: base.snapshot.candidate, checkedAt: new Date(now).toISOString(), errors: [],
    inventory: { status: 'resolved', graphs: {}, inputs: {} }, scanner: { status: 'clean', findings: [], errors: [] },
    official: { errors: [], findings: [], sources: [], packages: [], gaps: [] }, environment: { tools: {}, components: {} } };
  receipt.checks = iosMaintenanceChecks(receipt);
  return { base, receipt };
}

it('preserves other-platform findings and valid sibling-route environment evidence when adding iOS', () => {
  const now = Date.now();
  const { base, receipt } = reports(now);
  const embedded = base.coverage.find(asset => asset.id === 'embedded-native');
  const prior = embedded.checks.find(check => check.route === 'official-review');
  prior.status = 'findings';
  prior.findings = [{ package: 'android/native', advisory: 'prior', versions: ['1.0'], platform: 'android' }];
  const report = mergeIosSecurityCoverage(base, receipt, now);
  const merged = report.coverage.find(asset => asset.id === 'embedded-native');
  expect(merged.checks.find(check => check.route === 'official-review').findings).toContainEqual(prior.findings[0]);
  expect(merged.checks.find(check => check.route === 'vendor-notices').status).toBe('clean');
  expect(report.overallStatus).toBe('incomplete');
});

it('does not requalify or refresh expired prior evidence by merging a fresh iOS receipt', () => {
  const now = Date.now();
  const { base, receipt } = reports(now);
  const stale = base.coverage.find(asset => asset.id === 'embedded-native').checks.find(check => check.route === 'vendor-notices');
  stale.checkedAt = new Date(now - 30 * 3_600_000).toISOString();
  const report = mergeIosSecurityCoverage(base, receipt, now);
  const check = report.coverage.find(asset => asset.id === 'embedded-native').checks.find(row => row.route === 'vendor-notices');
  expect(check.status).toBe('error');
  expect(check.reason).toBe('observation-expired-or-invalid-time');
});

it('rejects tampered scanner archives before extraction', () => {
  expect(() => verifyTrivyArchive('tampered', digest('official-release'))).toThrow('SHA-256 mismatch');
  expect(() => verifyTrivyArchive('official-release', digest('official-release'))).not.toThrow();
});
