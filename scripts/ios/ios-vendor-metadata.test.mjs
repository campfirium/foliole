// @vitest-environment node
import { expect, it } from 'vitest';
import { APPLE_SECURITY, SQLITE_CVES } from './ios-security-test-support.mjs';
import { sqliteAdvisoryMetadata, assessSqliteAdvisories, appleSecurityMetadata,
  appleAdvisoryMetadata } from './ios-vendor-metadata.mjs';
import { pendingReleases } from './ios-security-sources.mjs';
import { appleUpdateReviews } from './ios-security-maintenance.mjs';

it('qualifies vendor table records, preserves non-core exclusions and matches only below documented SQLite fix', () => {
  const rows = sqliteAdvisoryMetadata(SQLITE_CVES);
  expect(rows[1].fixedVersion).toBeUndefined();
  expect(assessSqliteAdvisories(rows, '3.50.0')[0].advisory).toBe('CVE-2026-11822');
  expect(assessSqliteAdvisories(rows, '3.54.1')).toEqual([]);
  expect(() => sqliteAdvisoryMetadata(SQLITE_CVES.replace('3.53.2', 'unrecognized'))).toThrow();
  expect(() => sqliteAdvisoryMetadata(SQLITE_CVES.replace('CVE-2026-11822', 'CVE-2020-1234'))).toThrow('control');
});

it('retains Apple release metadata and marks device update information as applicability review', () => {
  const rows = appleSecurityMetadata(APPLE_SECURITY);
  const env = { tools: { xcode: 'Xcode 27.2' }, device: { status: 'observed', os: '27.0.1' } };
  expect(appleUpdateReviews(rows, env, 'os')).toHaveLength(1);
  expect(appleUpdateReviews(rows, env, 'os')[0].assessment).toContain('not a confirmed vulnerability');
  expect(appleUpdateReviews(rows, { tools: {}, device: { status: 'unsupported' } }, 'os')).toEqual([]);
  expect(() => appleSecurityMetadata(APPLE_SECURITY.replaceAll('149227', '111111'))).toThrow('control');
  expect(() => appleAdvisoryMetadata('WebKit CVE-2020-1234')).toThrow('control');
});

it('handles real two-part Protobuf versions and rejects unknown installed versions', () => {
  expect(pendingReleases([{ tag: 'v35.2', prerelease: false }], 'v35.1')).toHaveLength(1);
  expect(() => pendingReleases([], 'unknown')).toThrow();
});
