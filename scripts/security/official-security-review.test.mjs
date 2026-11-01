// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { officialSecurityAssets, officialSecurityObservations } from './official-security-review.mjs';
import { createCoverageReport } from './security-coverage.mjs';
import { notificationObservation } from './security-notification-fixture.mjs';
import { importSecurityObservation, projectSecurityOwner } from './security-owner.mjs';
import { notifySecurityOwner } from './security-notifications.mjs';

const roots = [];
const now = Date.now();
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }); });
function fixture() {
  const base = path.resolve('.tmp/artifacts/T674/official-review-tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'run-'));
  roots.push(root);
  const input = notificationObservation(now, { status: 'clean' });
  const snapshot = JSON.parse(input.rawReport).snapshot;
  snapshot.environments = {};
  const review = { schemaVersion: 1, checkedAt: new Date(now).toISOString(), candidate: snapshot.candidate,
    environment: 'isolated-review-host', assets: officialSecurityAssets.map(asset => ({ asset, status: 'unsupported',
      reason: 'Actual source read; environment mapping remains unknown', versions: { current: 'unknown' },
      sources: ['https://example.org/vendor/security'], findings: [], packages: [] })) };
  const file = path.join(root, 'review.json');
  return { root, file, input, snapshot, review };
}
function collect(f) {
  writeFileSync(f.file, JSON.stringify(f.review));
  const observations = officialSecurityObservations(f.file, f.snapshot);
  return createCoverageReport({ snapshot: f.snapshot, observations, now });
}
const findings = state => state.findings.filter(finding => finding.active);

it('persists official findings and unknown scopes, then delivers only changed results through the production queue', () => {
  const f = fixture();
  const row = f.review.assets.find(asset => asset.asset === 'gradle');
  row.status = 'findings'; row.versions = { gradle: '8.14.3' };
  row.findings = [{ advisory: 'GHSA-j5m7-59rp-24f5', package: 'gradle', platform: 'build-tools', versions: ['8.14.3'],
    severity: 'high', affectedRange: '<8.14.6', source: 'https://github.com/gradle/gradle/security/advisories/GHSA-j5m7-59rp-24f5',
    assessment: 'Official version predicate; unsafe historical toolchain is never executed' }];
  const report = collect(f);
  const owner = path.join(f.root, 'owner');
  const codexHome = path.join(f.root, 'codex');
  const runtime = path.join(codexHome, 'local-tools/desktop-handoff');
  mkdirSync(runtime, { recursive: true }); writeFileSync(path.join(runtime, 'config.json'), '{}');
  importSecurityObservation(owner, { ...f.input, rawReport: JSON.stringify(report) });
  expect(findings(projectSecurityOwner(owner, now))[0]).toMatchObject({ provider: 'official-review', severity: 'high', versions: ['8.14.3'] });
  const notifications = notifySecurityOwner(owner, f.root, { codexHome, now, batchQuietMs: 0 });
  expect(notifications.every(notification => notification.delivery.status === 'queued')).toBe(true);
  expect(notifySecurityOwner(owner, f.root, { codexHome, now, batchQuietMs: 0 })).toEqual(notifications);
  row.status = 'clean'; row.findings = []; row.versions = { gradle: '8.14.6' };
  f.review.checkedAt = new Date(now + 1000).toISOString();
  const recovered = collect(f); recovered.generatedAt = new Date(now + 1000).toISOString();
  importSecurityObservation(owner, { ...f.input, now: now + 1000, rawReport: JSON.stringify(recovered) });
  expect(findings(projectSecurityOwner(owner, now + 1000))).toHaveLength(0);
  expect(notifySecurityOwner(owner, f.root, { codexHome, now: now + 1000, batchQuietMs: 0 })).toHaveLength(notifications.length + 1);
  expect(projectSecurityOwner(owner, now + 1000).sources.find(source => source.asset === 'embedded-native').status).toBe('unsupported');
});

it.each(['missing-family', 'duplicate-family', 'missing-source', 'missing-assessment', 'malformed'])('keeps %s official review failures visible', kind => {
  const f = fixture();
  if (kind === 'missing-family') f.review.assets.pop();
  if (kind === 'duplicate-family') f.review.assets[1] = f.review.assets[0];
  if (kind === 'missing-source') f.review.assets[0].sources = [];
  if (kind === 'missing-assessment') f.review.assets[0].reason = '';
  if (kind === 'malformed') { writeFileSync(f.file, '{partial');
    expect(officialSecurityObservations(f.file, f.snapshot).every(row => row.status === 'error')).toBe(true); return; }
  const report = collect(f);
  expect(report.overallStatus).toBe('incomplete');
  expect(report.coverage.filter(row => row.checks.some(check => check.route === 'official-review' && check.status === 'error'))).toHaveLength(officialSecurityAssets.length);
});

it.each(['old-candidate', 'old-input', 'expired', 'future'])('does not qualify %s review against current facts', kind => {
  const f = fixture();
  if (kind === 'old-candidate') f.review.candidate = { ...f.snapshot.candidate, revision: 'f'.repeat(40) };
  if (kind === 'old-input') f.review.candidate = { ...f.snapshot.candidate, inputDigest: 'e'.repeat(64) };
  if (kind === 'expired') f.review.checkedAt = new Date(now - 193 * 3_600_000).toISOString();
  if (kind === 'future') f.review.checkedAt = new Date(now + 600_000).toISOString();
  const report = collect(f);
  const checks = report.coverage.flatMap(asset => asset.checks).filter(check => check.route === 'official-review');
  expect(checks.every(check => check.status === 'error')).toBe(true);
  expect(checks.some(check => check.observed?.evidence.versions)).toBe(true);
});
