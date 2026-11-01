import semver from 'semver';

const plain = html => html.replace(/<[^>]*>/gu, ' ').replace(/&nbsp;/gu, ' ')
  .replace(/&amp;/gu, '&').replace(/\s+/gu, ' ').trim();

export function sqliteAdvisoryMetadata(html) {
  if (!html.includes('Status Of Recent SQLite CVEs')) throw new Error('SQLite advisory table heading missing');
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gu)].flatMap(([, body]) => {
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gu)].map(([, value]) => value);
    if (cells.length !== 3) return [];
    const advisories = [...new Set(cells[0].match(/CVE-\d{4}-\d+/gu) ?? [])];
    if (!advisories.length) return [];
    const fix = plain(cells[1]);
    const fixedVersion = /^(\d+\.\d+\.\d+)/u.exec(fix)?.[1];
    if (!fixedVersion && !['Not a bug in SQLite', 'Not a bug in the core SQLite library'].includes(fix)) {
      throw new Error('Unrecognized SQLite advisory disposition');
    }
    return advisories.map(advisory => ({ advisory, fixedVersion, disposition: fix,
      assessment: plain(cells[2]), source: `https://sqlite.org/cves.html#${advisory}` }));
  });
  if (!rows.some(row => row.advisory === 'CVE-2026-11822' && row.fixedVersion === '3.53.2')) {
    throw new Error('SQLite known advisory positive control missing');
  }
  return rows;
}

export function assessSqliteAdvisories(rows, version) {
  if (!semver.valid(version)) throw new Error('Unknown embedded SQLite version');
  return rows.filter(row => row.fixedVersion && semver.lt(version, row.fixedVersion)).map(row => ({
    ...row, platform: 'ios', package: 'sqlite/sqlite', versions: [version], severity: 'unclassified',
    affectedRange: `<${row.fixedVersion}; lower bound/exposure require review`,
    assessment: `Potentially below vendor fix; not confirmed exploitable: ${row.assessment}` }));
}

export function appleSecurityMetadata(html) {
  if (!html.includes('Apple security releases') || !html.includes('Release&nbsp;date')) {
    throw new Error('Apple security release table heading missing');
  }
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gu)].flatMap(([, body]) => {
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gu)].map(([, value]) => value);
    if (cells.length !== 3) return [];
    const link = /href="(https:\/\/support\.apple\.com\/en-us\/\d+)"[^>]*>(.*?)<\/a>/u.exec(cells[0]);
    if (!link || !/iOS|macOS|Xcode|Safari/u.test(plain(link[2]))) return [];
    const date = plain(cells[2]);
    if (!Number.isFinite(Date.parse(date))) throw new Error('Apple release date unrecognized');
    return [{ title: plain(link[2]), source: link[1], availableFor: plain(cells[1]), publishedAt: date }];
  });
  if (!rows.some(row => row.source === 'https://support.apple.com/en-us/149227'
    && row.title.includes('iOS 26.7.2'))) throw new Error('Apple known security release control missing');
  return rows;
}

export function appleAdvisoryMetadata(html) {
  const cves = [...new Set(html.match(/CVE-\d{4}-\d+/gu) ?? [])];
  if (!cves.includes('CVE-2026-86971') || !html.includes('WebKit')) {
    throw new Error('Apple known CVE/WebKit advisory control missing');
  }
  return { cves, components: ['WebKit'], source: 'https://support.apple.com/en-us/149227',
    scope: 'Known-source qualification; does not establish installed OS affectedness' };
}
