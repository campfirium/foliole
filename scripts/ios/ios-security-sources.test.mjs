/* global Response */
// @vitest-environment node
import { expect, it } from 'vitest';
import { APPLE_RELEASES, SQLCIPHER_ADVISORY, readOfficialSource,
  releaseMetadata, assessSqlcipherRelease, pendingReleases, appleReleaseMetadata } from './ios-security-sources.mjs';

const sqlRelease = { tag: 'v4.19.0', body: `security sqlcipher_export hexkey ${SQLCIPHER_ADVISORY}` };
it('finds vendor-only SQLCipher issues at 4.17 and 4.18, and clears only at the reviewed fixed range', () => {
  for (const version of ['4.17.0', '4.18.0']) {
    expect(assessSqlcipherRelease([sqlRelease], version)[0]).toMatchObject({ versions: [version], severity: 'low' });
  }
  expect(assessSqlcipherRelease([sqlRelease], '4.19.0')).toEqual([]);
  expect(assessSqlcipherRelease([sqlRelease], '4.20.0')).toEqual([]);
  expect(() => assessSqlcipherRelease([], '4.20.0')).toThrow('positive control');
  expect(() => assessSqlcipherRelease([sqlRelease], 'unknown')).toThrow('Unknown');
});

it('distinguishes newer release information from vulnerability findings', () => {
  const rows = releaseMetadata(JSON.stringify([{ tag_name: '1.39.0', html_url: 'https://github.com/apple/swift-protobuf/releases/tag/1.39.0',
    body: '', published_at: '2026-10-29T00:00:00Z', prerelease: false }]));
  expect(pendingReleases(rows, '1.38.1')[0].disposition).toContain('not a confirmed vulnerability');
  expect(pendingReleases(rows, '1.39.0')).toEqual([]);
  expect(() => releaseMetadata('{}')).toThrow('metadata');
});

it('retains source HTTP failure, stale date and malformed content as errors', async () => {
  const now = Date.now();
  await expect(readOfficialSource(APPLE_RELEASES, { now, fetchSource: async () => new Response('', { status: 503 }) })).rejects.toThrow('HTTP 503');
  await expect(readOfficialSource(APPLE_RELEASES, { now, fetchSource: async () => new Response('bad',
    { headers: { date: 'Sat, 01 Jan 2000 00:00:00 GMT' } }) })).rejects.toThrow('stale');
  expect(() => appleReleaseMetadata('<html>bad</html>')).toThrow('Unrecognized');
  expect(() => appleReleaseMetadata('<rss ><title>Releases - Apple Developer</title></rss>')).toThrow('Empty');
});
