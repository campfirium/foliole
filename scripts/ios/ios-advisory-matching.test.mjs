// @vitest-environment node
/* global structuredClone */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { advisoryReviews, protobufCppMetadata } from './ios-advisory-matching.mjs';
import { collectIosOfficialSecurity } from './ios-official-security.mjs';
import { startOfficialPublisher } from './ios-security-test-support.mjs';
import { notificationObservation } from '../security/security-notification-fixture.mjs';
import { importSecurityObservation, projectSecurityOwner } from '../security/security-owner.mjs';

const row = (ecosystem, name, range) => ({ advisory: 'GHSA-rvm3-566m-v7fv', severity: 'critical',
  source: 'https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv',
  vulnerabilities: [{ package: { ecosystem, name }, vulnerable_version_range: range }] });

it('matches actual Swift package/ranges and excludes unrelated binding ecosystems while retaining unknown range semantics', () => {
  const cap = row('swift', 'github.com/ionic-team/capacitor-swift-pm', '>= 8.5.0, < 8.5.1');
  expect(advisoryReviews('ionic-team/capacitor', '8.5.0', [cap])[0].severity).toBe('critical');
  expect(advisoryReviews('ionic-team/capacitor', '8.5.3', [cap])).toEqual([]);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [row('pecl', 'protobuf', '<5.34.0')], '7.35.1')).toEqual([]);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [row('c++', 'Protobuf', '<4.25.0')], '7.35.1')).toEqual([]);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [row('c++', 'Protobuf', 'unknown')], '7.35.1')[0].severity).toBe('info');
  expect(protobufCppMetadata('#define GOOGLE_PROTOBUF_VERSION 7035001').version).toBe('7.35.1');
});

it('excludes versions above every published upper bound without guessing ambiguous affected branches', () => {
  const advisory = row('c++', 'protobuf-cpp', '<=3.16.1, <=3.17.3, <=3.18.2, <=3.19.4, <=3.20.1, <=3.21.5');
  expect(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [advisory], '7.35.1')).toEqual([]);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v21.6', [advisory], '3.21.6')).toEqual([]);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v21.5', [advisory], '3.21.5')).toHaveLength(1);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v18.3', [advisory], '3.18.3')).toHaveLength(1);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v21.5-rc', [advisory], '3.21.5-rc.1')).toHaveLength(1);
  const malformed = row('c++', 'protobuf-cpp', '<=3.21.5, not-a-range');
  expect(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [malformed], '7.35.1')).toHaveLength(1);
});

it('retires a corrected Protobuf review in the same durable owner while retaining unrelated unknown coverage', () => {
  const base = path.resolve('.tmp/artifacts/T674-5/advisory-owner-regression');
  mkdirSync(base, { recursive: true });
  const owner = mkdtempSync(path.join(base, 'owner-'));
  const now = Date.now();
  const input = notificationObservation(now, { status: 'clean' });
  const baseline = JSON.parse(input.rawReport);
  const advisory = row('c++', 'protobuf-cpp', '<=3.16.1, <=3.21.5');
  const previous = { platform: 'ios', advisory: `review-${advisory.advisory}`, package: 'protocolbuffers/protobuf',
    versions: ['7.35.1'], severity: 'info', source: advisory.source, assessment: 'Previously unresolved range' };
  const unknown = { ...previous, package: 'foliole/swift-native', advisory: 'coverage-review-required' };
  const observe = (findings, attempt) => {
    const report = structuredClone(baseline);
    report.generatedAt = new Date(now + attempt).toISOString();
    const check = report.coverage.find(asset => asset.id === 'swift-native').checks.find(check => check.route === 'official-review');
    Object.assign(check, { candidate: report.snapshot.candidate, status: 'findings', findings: [unknown, ...findings] });
    importSecurityObservation(owner, { ...input, rawReport: JSON.stringify(report), now: now + attempt,
      envelope: { ...input.envelope, artifactId: attempt + 1 } });
  };
  try {
    observe([previous], 0);
    expect(projectSecurityOwner(owner, now).findings.find(finding => finding.package === previous.package).active).toBe(true);
    observe(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [advisory], '7.35.1'), 1);
    const reloaded = projectSecurityOwner(owner, now + 1);
    expect(reloaded.findings.find(finding => finding.package === previous.package).active).toBe(false);
    expect(reloaded.findings.find(finding => finding.package === unknown.package).active).toBe(true);
    expect(reloaded.overallStatus).toBe('incomplete');
  } finally { rmSync(owner, { recursive: true, force: true }); }
});

it('does not notify fixed Capacitor or unrelated PHP advisories through the production official collector', async () => {
  const publisher = await startOfficialPublisher(Date.now());
  const base = path.resolve('.tmp/artifacts/T674-3/advisory-regression');
  mkdirSync(base, { recursive: true });
  const output = mkdtempSync(path.join(base, 'run-'));
  const records = [row('swift', 'github.com/ionic-team/capacitor-swift-pm', '>= 8.5.0, < 8.5.1'),
    row('pecl', 'protobuf', '<5.34.0')];
  publisher.state.advisories = records.map(record => ({ ...record, ghsa_id: record.advisory,
    html_url: record.source, summary: 'Qualified upstream advisory metadata' }));
  try {
    const report = await collectIosOfficialSecurity({ pins: [{ identity: 'capacitor-swift-pm',
      url: 'https://github.com/ionic-team/capacitor-swift-pm.git', version: '8.5.3', revision: 'a'.repeat(40) }],
    output, fetchSource: publisher.fetchSource });
    expect(report.findings.filter(finding => finding.advisory.startsWith('review-'))).toEqual([]);
  } finally { await publisher.close(); rmSync(output, { recursive: true, force: true }); }
});
