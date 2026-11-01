// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { advisoryReviews, protobufCppMetadata } from './ios-advisory-matching.mjs';
import { collectIosOfficialSecurity } from './ios-official-security.mjs';
import { startOfficialPublisher } from './ios-security-test-support.mjs';

const row = (ecosystem, name, range) => ({ advisory: 'GHSA-rvm3-566m-v7fv', severity: 'critical',
  source: 'https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv',
  vulnerabilities: [{ package: { ecosystem, name }, vulnerable_version_range: range }] });

it('matches actual Swift package/ranges and excludes unrelated binding ecosystems while retaining unknown range semantics', () => {
  const cap = row('swift', 'github.com/ionic-team/capacitor-swift-pm', '>= 8.5.0, < 8.5.1');
  expect(advisoryReviews('ionic-team/capacitor', '8.5.0', [cap])[0].severity).toBe('critical');
  expect(advisoryReviews('ionic-team/capacitor', '8.5.3', [cap])).toEqual([]);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [row('pecl', 'protobuf', '<5.34.0')], '7.35.1')).toEqual([]);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [row('c++', 'Protobuf', '<4.25.0')], '7.35.1')).toEqual([]);
  expect(advisoryReviews('protocolbuffers/protobuf', 'v35.1', [row('c++', 'Protobuf', '<=3.16.1, <=3.21.5')], '7.35.1')[0].severity).toBe('info');
  expect(protobufCppMetadata('#define GOOGLE_PROTOBUF_VERSION 7035001').version).toBe('7.35.1');
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
