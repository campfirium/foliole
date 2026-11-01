import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { IOS_REPOSITORIES, APPLE_RELEASES, readOfficialSource, releaseMetadata,
  appleReleaseMetadata, pendingReleases, assessSqlcipherRelease } from './ios-security-sources.mjs';
import { sqliteAdvisoryMetadata, appleSecurityMetadata, appleAdvisoryMetadata } from './ios-vendor-metadata.mjs';

export async function collectIosOfficialSecurity({ pins, output, token, now = Date.now(), fetchSource }) {
  mkdirSync(output, { recursive: true });
  const report = { checkedAt: new Date(now).toISOString(), sources: [], packages: [], findings: [], errors: [],
    gaps: ['New vendor notices require affected-range/exposure review; metadata acquisition alone does not attest safety.'] };
  const read = async (id, url, parse) => {
    try {
      const source = await readOfficialSource(url, { token, now, fetchSource });
      writeFileSync(path.join(output, `${id}.raw`), source.text);
      const result = parse(source.text);
      if (id.endsWith('-advisories') && /rel="next"/u.test(source.pagination ?? '')) {
        throw new Error('Public advisory pagination is incomplete; do not attest an empty/partial list');
      }
      report.sources.push({ ...source, text: undefined, records: result, id, status: 'clean', scope: 'source acquisition and parsing' });
      return result;
    } catch (error) {
      const failure = { id, url, status: 'error', checkedAt: report.checkedAt, reason: error.message };
      report.sources.push(failure); report.errors.push(failure);
      return undefined;
    }
  };
  for (const pin of pins) {
    const repositories = IOS_REPOSITORIES[pin.identity];
    if (!repositories || pin.url.replace(/\.git$/u, '').toLowerCase() !== `https://github.com/${repositories[0]}`.toLowerCase()) {
      report.errors.push({ id: pin.identity, reason: 'Unqualified remote repository/maintainer' });
      continue;
    }
    report.packages.push({ ...pin, repositories });
    for (const repository of repositories) {
      const id = repository.replace('/', '--');
      const releases = await read(`${id}-releases`, `https://api.github.com/repos/${repository}/releases?per_page=100`, releaseMetadata);
      const advisories = await read(`${id}-advisories`, `https://api.github.com/repos/${repository}/security-advisories`, advisoryMetadata);
      if (advisories?.length) report.gaps.push(`${repository}: ${advisories.length} public notices retained for package/range review; empty lists never attest safety`);
      if (advisories && repository !== 'protocolbuffers/protobuf') {
        report.findings.push(...advisoryReviews(repository, pin.version, advisories));
      }
      if (releases && repository === repositories[0]) {
        qualifyReleaseWindow(report, id, releases, pin.version);
        report.findings.push(...pendingReleases(releases, pin.version).map(row => releaseReview(repository, pin.version, row)));
      }
      if (releases && repository === 'sqlcipher/sqlcipher') {
        try { report.findings.push(...assessSqlcipherRelease(releases, pin.version)); }
        catch (error) { report.errors.push({ id, reason: error.message }); }
      }
    }
  }
  const protobuf = pins.find(pin => pin.identity === 'swift-protobuf');
  if (protobuf) {
    report.vendored = await read('swift-protobuf-vendored',
      `https://raw.githubusercontent.com/apple/swift-protobuf/${protobuf.revision}/Sources/protobuf/VERSIONS.json`, vendoredMetadata);
    if (report.vendored) await collectVendored(report, report.vendored, read);
  }
  report.apple = await read('apple-releases', APPLE_RELEASES, appleReleaseMetadata);
  report.appleSecurity = await read('apple-security-releases', 'https://support.apple.com/en-us/100100', appleSecurityMetadata);
  report.appleControl = await read('apple-known-advisory', 'https://support.apple.com/en-us/149227', appleAdvisoryMetadata);
  report.sqlite = await read('sqlite-advisories', 'https://sqlite.org/cves.html', sqliteAdvisoryMetadata);
  report.status = report.errors.length ? 'error' : report.findings.length ? 'findings' : 'unsupported';
  return report;
}

function advisoryMetadata(text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.some(row => !row.ghsa_id || !row.html_url || !row.summary)) {
    throw new Error('Malformed public repository advisories');
  }
  // Trivy evaluates Swift ranges. These additional advisory records retain other ecosystem/vendor notices for review.
  return rows.map(row => ({ advisory: row.ghsa_id, source: row.html_url, summary: row.summary,
    vulnerabilities: row.vulnerabilities, publishedAt: row.published_at }));
}

export function vendoredMetadata(text) {
  const data = JSON.parse(text);
  if (!data.protobuf?.tag || !data.abseil?.tag || Object.values(data).some(row =>
    !/^[a-f0-9]{40}$/u.test(row.commit) || !row.tag)) throw new Error('Malformed vendored build component versions');
  return data;
}

async function collectVendored(report, versions, read) {
  for (const [component, repository] of [['protobuf', 'protocolbuffers/protobuf'], ['abseil', 'abseil/abseil-cpp']]) {
    const installed = versions[component];
    const id = `vendored-${component}`;
    const releases = await read(`${id}-releases`, `https://api.github.com/repos/${repository}/releases?per_page=100`, releaseMetadata);
    const advisories = await read(`${id}-advisories`, `https://api.github.com/repos/${repository}/security-advisories`, advisoryMetadata);
    report.packages.push({ identity: id, version: installed.tag, revision: installed.commit,
      scope: 'host build-time protoc; not SwiftProtobuf runtime', repositories: [repository] });
    if (releases) qualifyReleaseWindow(report, id, releases, installed.tag);
    if (advisories) report.findings.push(...advisoryReviews(repository, installed.tag, advisories));
    if (releases && component === 'protobuf') {
      report.findings.push(...pendingReleases(releases, installed.tag.replace(/^v/u, '')).map(row => releaseReview(repository, installed.tag, row)));
    }
    if (advisories?.length) report.gaps.push(`${id}: ${advisories.length} public advisories require component-specific affected-range review`);
    if (component === 'abseil') report.gaps.push('Abseil date-based release tags require explicit upgrade/applicability review');
  }
}

function releaseReview(repository, version, row) {
  return { platform: 'ios', advisory: `release-${row.tag}`, package: repository, versions: [version],
    severity: 'info', source: row.source, assessment: row.disposition };
}

function advisoryReviews(repository, version, advisories) {
  return advisories.map(row => ({ platform: 'ios', advisory: `review-${row.advisory}`,
    package: repository, versions: [version], severity: 'info', source: row.source,
    assessment: 'Official advisory notice; package/range applicability requires review, not a confirmed vulnerability' }));
}

function qualifyReleaseWindow(report, id, releases, version) {
  if (releases.length >= 100 && !releases.some(row => row.tag.replace(/^v/u, '') === version.replace(/^v/u, ''))) {
    report.errors.push({ id, reason: 'Release pagination does not reach installed baseline; coverage incomplete' });
  }
}
