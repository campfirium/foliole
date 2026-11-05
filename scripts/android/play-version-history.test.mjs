// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { preparePlayCandidate } from './play-distribution.mjs';
import { readPlayVersionHistory, recordPlayVersion } from './play-version-history.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const receipt = { schemaVersion: 1, packageName: 'com.campfirium.foliole.android', track: 'beta',
  versionCode: 23, sourceSha: 'a'.repeat(40), acceptedSha: 'a'.repeat(40), runId: '42',
  aabSha256: 'b'.repeat(64), phase: 'uploaded' };

function fixture() {
  const parent = path.resolve('.tmp/artifacts/T251-13'); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'version-history-')); roots.push(root);
  const file = path.join(root, 'history.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, packageName: receipt.packageName, highestVersionCode: 2,
    evidence: { source: 'Verified fixture upload', observedAt: '2026-11-05T00:00:00Z' } }));
  return file;
}

it('retains a used code on disk after Play no longer lists that release', async () => {
  const file = fixture();
  recordPlayVersion(receipt, file);
  const api = async (method, route) => {
    if (route === 'tracks/beta/releases') return {};
    if (route === 'edits') return { id: '123' };
    if (route.endsWith('/tracks')) return { tracks: [{ track: 'beta' }] };
    if (route.endsWith('/bundles')) return { bundles: [{ versionCode: 1 }] };
    return {};
  };
  const candidate = await preparePlayCandidate(api, { sourceSha: 'a'.repeat(40),
    acceptedSha: 'a'.repeat(40), runId: '43', version: '0.7.17' }, readPlayVersionHistory(file));
  expect(candidate.versionCode).toBe(24);
  expect(candidate.historyVersionCode).toBe(23);
});

it('never lowers the remembered code when an older receipt is replayed', () => {
  const file = fixture();
  recordPlayVersion(receipt, file);
  const before = fs.readFileSync(file, 'utf8');
  recordPlayVersion({ ...receipt, versionCode: 3 }, file);
  recordPlayVersion(receipt, file);
  expect(fs.readFileSync(file, 'utf8')).toBe(before);
});

it('reserves uncertain uploads instead of reusing a possibly consumed code', () => {
  const file = fixture();
  recordPlayVersion({ ...receipt, phase: 'upload-unknown' }, file);
  expect(readPlayVersionHistory(file).highestVersionCode).toBe(23);
});

it('does not remember prepared or signed-only packages and rejects mismatched receipts', () => {
  const file = fixture(); const before = fs.readFileSync(file, 'utf8');
  for (const change of [{ phase: 'prepared' }, { phase: 'signed' }, { packageName: 'other' },
    { track: 'production' }, { versionCode: 0 }, { aabSha256: '' }, { acceptedSha: 'c'.repeat(40) }]) {
    expect(() => recordPlayVersion({ ...receipt, ...change }, file)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  }
});

it('refuses absent or corrupted history rather than inventing a starting number', () => {
  const file = fixture();
  fs.writeFileSync(file, '{}');
  expect(() => readPlayVersionHistory(file)).toThrow();
  fs.rmSync(file);
  expect(() => readPlayVersionHistory(file)).toThrow();
});
