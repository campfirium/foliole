/* global fetch, AbortSignal, URL */
import { createHash } from 'node:crypto';
import semver from 'semver';

export const IOS_REPOSITORIES = {
  'capacitor-swift-pm': ['ionic-team/capacitor-swift-pm', 'ionic-team/capacitor'],
  'sqlcipher.swift': ['sqlcipher/SQLCipher.swift', 'sqlcipher/sqlcipher'],
  'swift-protobuf': ['apple/swift-protobuf', 'protocolbuffers/protobuf'],
  zipfoundation: ['weichsel/ZIPFoundation']
};
export const SQLCIPHER_ADVISORY = 'https://www.zetetic.net/blog/2026/09/08/sqlcipher-4.19.0-release/';
export const APPLE_RELEASES = 'https://developer.apple.com/news/releases/rss/releases.rss';

export async function readOfficialSource(url, { fetchSource = fetch, now = Date.now(), token } = {}) {
  const response = await fetchSource(url, { signal: AbortSignal.timeout(30_000),
    headers: { Accept: url.includes('api.github.com') ? 'application/vnd.github+json' : 'application/rss+xml',
      ...(token && new URL(url).hostname === 'api.github.com' ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(`Official source HTTP ${response.status}: ${url}`);
  const serverDate = Date.parse(response.headers.get('date'));
  if (!Number.isFinite(serverDate) || Math.abs(now - serverDate) > 26 * 3_600_000) {
    throw new Error(`Official source response date missing/stale: ${url}`);
  }
  const text = await response.text();
  return { url, checkedAt: new Date(now).toISOString(), serverDate: new Date(serverDate).toISOString(),
    pagination: response.headers.get('link'),
    sha256: createHash('sha256').update(text).digest('hex'), text };
}

export function releaseMetadata(text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !row.tag_name || !row.html_url
    || typeof row.body !== 'string' || !Number.isFinite(Date.parse(row.published_at)))) {
    throw new Error('Malformed or empty official release metadata');
  }
  return rows.filter(row => !row.draft).map(row => ({ tag: row.tag_name, source: row.html_url,
    publishedAt: row.published_at, prerelease: row.prerelease, body: row.body }));
}

export function assessSqlcipherRelease(releases, version) {
  const control = releases.find(row => row.tag === 'v4.19.0');
  if (!control?.body.includes(SQLCIPHER_ADVISORY)
    || !/security/iu.test(control.body) || !control.body.includes('hexkey')
    || !control.body.includes('sqlcipher_export')) throw new Error('SQLCipher vendor positive control missing');
  if (!semver.valid(version)) throw new Error('Unknown SQLCipher core version');
  if (semver.major(version) !== 4) throw new Error('SQLCipher version is outside the reviewed 4.x advisory predicate');
  // A reviewed vendor predicate, not an inference from the latest version or release prose.
  return semver.satisfies(version, '>=4.0.0 <4.19.0') ? [{ platform: 'ios',
    advisory: 'sqlcipher-4.19.0-export-hexkey', package: 'sqlcipher/sqlcipher', versions: [version],
    affectedRange: '>=4.0.0 <4.19.0', severity: 'low', source: SQLCIPHER_ADVISORY,
    assessment: 'Vendor identifies two low-risk issues through 4.18.0; exposure requires application review.' }] : [];
}

export function pendingReleases(releases, version) {
  const numeric = value => /^v?\d+\.\d+(?:\.\d+)?$/u.test(value) ? semver.coerce(value)?.version : undefined;
  const installed = numeric(version);
  if (!installed) throw new Error('Unknown installed release version');
  return releases.filter(row => !row.prerelease && numeric(row.tag)
    && semver.gt(numeric(row.tag), installed)).map(row => ({ ...row,
    disposition: 'release-review-required; not a confirmed vulnerability' }));
}

const xmlText = value => value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u, '$1')
  .replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>');

export function appleReleaseMetadata(text) {
  if (!/<rss\s/u.test(text) || !/<title>Releases - Apple Developer<\/title>/u.test(text)) {
    throw new Error('Unrecognized Apple release feed');
  }
  const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/gu)].map(([, body]) => {
    const field = name => xmlText(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'u').exec(body)?.[1] ?? '');
    const row = { title: field('title'), source: field('link'), publishedAt: field('pubDate') };
    if (!row.title || !row.source.startsWith('https://developer.apple.com/')
      || !Number.isFinite(Date.parse(row.publishedAt))) throw new Error('Malformed Apple release entry');
    return row;
  });
  if (!items.length) throw new Error('Empty Apple release feed');
  return items.filter(row => /Xcode|iOS|iPadOS|Safari|macOS/iu.test(row.title));
}
