import { createHash } from 'node:crypto';

export const ANDROID_OFFICIAL_SOURCES = Object.freeze({
  gradle: 'https://api.github.com/repos/gradle/gradle/security-advisories?per_page=100',
  sqlcipher: 'https://api.github.com/repos/sqlcipher/sqlcipher/releases?per_page=100'
});

export function compareVersions(left, right) {
  const parse = value => /^v?(\d+)\.(\d+)(?:\.(\d+))?$/u.exec(value)?.slice(1).map(part => Number(part ?? 0));
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) throw new Error('Unrecognised stable version');
  return a.reduce((result, value, index) => result || Math.sign(value - b[index]), 0);
}

async function sourcePages(url, fetchImpl) {
  const rows = [];
  const digests = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetchImpl(`${url}&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json' }, signal: globalThis.AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`Official source HTTP ${response.status}`);
    const text = await response.text();
    const body = JSON.parse(text);
    if (!Array.isArray(body) || page === 1 && !body.length) throw new Error('Official source has no parsed records');
    rows.push(...body);
    digests.push(createHash('sha256').update(text).digest('hex'));
    if (!response.headers.get('link')?.includes('rel="next"')) return { rows, digests };
  }
  throw new Error('Official source pagination exceeded limit');
}

function finding(advisory, version, source, assessment, severity = 'unclassified') {
  return { platform: 'android', package: advisory.startsWith('GHSA-') ? 'gradle' : 'sqlcipher',
    advisory, versions: [version], source, assessment, severity };
}

function gradleFindings(rows, version) {
  return rows.flatMap(row => {
    if (!/^GHSA-/u.test(row.ghsa_id ?? '') || !row.vulnerabilities?.length
      || !row.html_url?.startsWith('https://github.com/gradle/gradle/security/advisories/')
      || !Number.isFinite(Date.parse(row.published_at))) throw new Error('Malformed Gradle advisory');
    const fixes = row.vulnerabilities.flatMap(value => (value.patched_versions ?? '').split(',').map(part => part.trim().replace(/^>=\s*/u, '')))
      .filter(value => /^\d+\.\d+(?:\.\d+)?$/u.test(value));
    const sameMajor = fixes.filter(value => value.split('.')[0] === version.split('.')[0]);
    if ((sameMajor.length ? sameMajor : fixes).some(value => compareVersions(version, value) >= 0)) return [];
    if (!fixes.length) throw new Error('Gradle advisory has no supported patched version');
    // Old major-only advisories cannot be proven applicable from a missing patch branch.
    return [finding(row.ghsa_id, version, row.html_url,
      `Needs assessment against vendor range ${row.vulnerabilities.map(value => value.vulnerable_version_range).join('; ')}; patched versions ${fixes.join(', ')}.`,
      ['low', 'moderate', 'high', 'critical'].includes(row.severity) ? row.severity : 'unclassified')];
  });
}

function sqlcipherFindings(rows, version) {
  return rows.flatMap(row => {
    if (!row.tag_name || !row.html_url?.startsWith('https://github.com/sqlcipher/sqlcipher/releases/')
      || !Number.isFinite(Date.parse(row.published_at)) || typeof row.body !== 'string') throw new Error('Malformed SQLCipher release');
    if (row.draft || row.prerelease || !/^v\d+\.\d+\.\d+$/u.test(row.tag_name)) return [];
    if (compareVersions(version, row.tag_name) >= 0) return [];
    const assessment = `New vendor release ${row.tag_name}; impact requires assessment, not a vulnerability verdict. ${row.body}`;
    if (row.tag_name === 'v4.19.0') {
      if (!row.body.includes('hexkey') || !row.body.includes('sqlcipher_export') || !row.body.includes('security')) {
        throw new Error('SQLCipher historical security positive control disappeared');
      }
      return ['hexkey', 'sqlcipher_export'].map(issue => finding(`vendor-4.19.0-${issue}`, version, row.html_url, assessment, 'low'));
    }
    return [finding(`release-review-${row.tag_name}`, version, row.html_url, assessment, 'info')];
  });
}

export async function collectAndroidOfficialSecurity(inventory, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const sqlcipher = inventory?.configurations?.flatMap(row => row.modules ?? [])
    .filter(row => row.group === 'net.zetetic' && row.name === 'sqlcipher-android').map(row => row.version);
  const definitions = [
    { asset: 'gradle', source: ANDROID_OFFICIAL_SOURCES.gradle, versions: { gradle: inventory?.gradleVersion }, assess: gradleFindings },
    { asset: 'embedded-native', source: ANDROID_OFFICIAL_SOURCES.sqlcipher,
      versions: { sqlcipher: [...new Set(sqlcipher)].join(',') }, assess: sqlcipherFindings }
  ];
  return Promise.all(definitions.map(async definition => {
    const result = { asset: definition.asset, route: 'vendor-notices', checkedAt: new Date(now).toISOString(),
      source: definition.source, findings: [], evidence: { versions: definition.versions, sources: [definition.source] } };
    try {
      const version = Object.values(definition.versions)[0];
      compareVersions(version, version);
      const { rows, digests } = await sourcePages(definition.source, fetchImpl);
      result.evidence.responseDigests = digests;
      result.evidence.records = rows.length;
      result.findings = definition.assess(rows, version);
      result.status = result.findings.length ? 'findings' : 'clean';
      result.reason = result.findings.length ? 'vendor-notices-require-impact-assessment'
        : 'published-vendor-notices-checked; other coverage routes remain independent';
    } catch (error) { result.status = 'error'; result.reason = error.message; }
    return result;
  }));
}
