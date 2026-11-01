import { compareVersions } from './android-official-security.mjs';
import { digest } from '../security/security-inputs.mjs';

export async function collectAndroidComponentNotices(components, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const sources = ['https://www.sqlite.org/changes.html', 'https://api.github.com/repos/libtom/libtomcrypt/releases?per_page=100'];
  const row = { asset: 'embedded-native', route: 'component-notices', source: sources.join(' '),
    checkedAt: new Date(now).toISOString(), findings: [], evidence: { versions: components, sources } };
  try {
    const libraries = components?.flatMap(component => component.libraries) ?? [];
    if (!libraries.length || libraries.some(library => ['sqlite', 'crypto', 'sqlcipher'].some(key => library[key] === 'unknown')
      || library.provider !== 'LibTomCrypt')) throw new Error('Actual embedded component identities are incomplete');
    const bodies = await Promise.all(sources.map(async source => {
      const response = await fetchImpl(source, { signal: globalThis.AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Native component source HTTP ${response.status}`);
      return response.text();
    }));
    const sqlite = /<h3>\d{4}-\d{2}-\d{2}\s+\((3\.\d+\.\d+)\)<\/h3>/u.exec(bodies[0])?.[1];
    const cryptoRows = JSON.parse(bodies[1]);
    if (!sqlite || !Array.isArray(cryptoRows) || !cryptoRows.length) throw new Error('Native release sources have no parsed versions');
    const crypto = cryptoRows.filter(release => !release.draft && !release.prerelease)
      .map(release => release.tag_name?.replace(/^v/u, '')).filter(version => /^\d+\.\d+\.\d+$/u.test(version ?? '')).sort(compareVersions).at(-1);
    if (!crypto) throw new Error('LibTomCrypt source has no stable version');
    for (const [key, latest, source] of [['sqlite', sqlite, sources[0]], ['crypto', crypto, sources[1]]]) {
      for (const version of new Set(libraries.map(library => library[key]))) {
        if (compareVersions(version, latest) < 0) row.findings.push({ platform: 'android', package: key === 'crypto' ? 'libtomcrypt' : key,
          advisory: `release-review-${latest}`, versions: [version], source, severity: 'info',
          assessment: `Binary identifies ${version}; upstream stable release is ${latest}. Vendor-fork backports and applicability require assessment; an update is not itself a vulnerability.` });
      }
    }
    row.evidence.latest = { sqlite, crypto };
    row.evidence.responseDigests = bodies.map(digest);
    row.status = row.findings.length ? 'findings' : 'clean';
    row.reason = 'upstream-release-watch-only; vendor-fork-security-review-remains-independent';
  } catch (error) { row.status = 'error'; row.reason = error.message; }
  return row;
}
