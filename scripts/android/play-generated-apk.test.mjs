/* global Buffer */
// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { collectPlayUniversalApk, inspectPlayApk, selectPlayUniversalApk } from './play-generated-apk.mjs';

const identity = { sourceSha: 'a'.repeat(40), acceptedSha: 'a'.repeat(40), runId: '42', version: '0.7.17' };
const certificate = 'b'.repeat(64);
const candidate = { schemaVersion: 1, ...identity, packageName: 'com.campfirium.foliole.android',
  track: 'beta', editId: '123', versionCode: 3, phase: 'observed', aabSha256: 'c'.repeat(64) };
const metadata = () => ({ generatedApks: [{ certificateSha256Hash: certificate,
  generatedUniversalApk: { downloadId: 'exact-universal' }, generatedSplitApks: [{ downloadId: 'never-split' }] }] });
const actual = { packageName: candidate.packageName, versionCode: 3, version: '0.7.17', certificateSha256: certificate };
const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function directory() {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  const result = fs.mkdtempSync(path.resolve('.tmp/artifacts/play-apk-test-'));
  directories.push(result);
  return result;
}

it('requires the independently supplied exact signing key and universal output without selecting splits or another key', () => {
  expect(selectPlayUniversalApk(metadata(), certificate.toUpperCase().match(/../gu).join(':')).downloadId).toBe('exact-universal');
  for (const pin of [undefined, '', 'upload-key', 'd'.repeat(64)]) {
    expect(() => selectPlayUniversalApk(metadata(), pin)).toThrow();
  }
  const missing = metadata(); delete missing.generatedApks[0].generatedUniversalApk;
  expect(() => selectPlayUniversalApk(missing, certificate)).toThrow(/not generated/u);
  const ambiguous = metadata(); ambiguous.generatedApks.push(ambiguous.generatedApks[0]);
  expect(() => selectPlayUniversalApk(ambiguous, certificate)).toThrow(/ambiguous/u);
  expect(() => selectPlayUniversalApk({}, certificate)).toThrow(/unavailable/u);
});

it('downloads, inspects and persists the same candidate, preserving verified files across failed recovery and retry', async () => {
  const output = directory();
  const bytes = Buffer.from('isolated downloaded APK boundary');
  const api = vi.fn(async () => metadata());
  const download = vi.fn(async () => bytes);
  const inspect = vi.fn(file => { expect(fs.readFileSync(file)).toEqual(bytes); return actual; });
  const input = { api, download, inspect, directory: output, candidate, identity, certificateSha256: certificate };
  const first = await collectPlayUniversalApk(input);
  expect(api).toHaveBeenCalledWith('GET', 'generatedApks/3');
  expect(download).toHaveBeenCalledWith(3, 'exact-universal');
  expect(first.apkSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(JSON.parse(fs.readFileSync(path.join(output, 'generated-apk.json')))).toEqual(first);
  await expect(collectPlayUniversalApk({ ...input, inspect: () => ({ ...actual, versionCode: 2 }) })).rejects.toThrow(/differs/u);
  expect(fs.readFileSync(path.join(output, first.asset))).toEqual(bytes);
  expect(JSON.parse(fs.readFileSync(path.join(output, 'generated-apk.json')))).toEqual(first);
  expect(await collectPlayUniversalApk(input)).toEqual(first);
  expect(fs.readdirSync(output).sort()).toEqual([first.asset, 'generated-apk.json'].sort());
});

it('rejects wrong source or unconfirmed upload before network access and rejects package, version, signer or invalid bytes', async () => {
  const api = vi.fn(async () => metadata());
  const input = { api, download: async () => Buffer.from('boundary'), directory: directory(), candidate,
    identity, certificateSha256: certificate, inspect: () => actual };
  for (const patch of [{ sourceSha: 'd'.repeat(40) }, { phase: 'upload-unknown' }, { aabSha256: undefined }]) {
    await expect(collectPlayUniversalApk({ ...input, candidate: { ...candidate, ...patch } })).rejects.toThrow();
  }
  expect(api).not.toHaveBeenCalled();
  for (const patch of [{ packageName: 'other' }, { version: '0.7.16' }, { certificateSha256: 'd'.repeat(64) }]) {
    await expect(collectPlayUniversalApk({ ...input, inspect: () => ({ ...actual, ...patch }) })).rejects.toThrow(/differs/u);
  }
  await expect(collectPlayUniversalApk({ ...input, inspect: () => { throw new Error('invalid APK'); } })).rejects.toThrow('invalid APK');
  expect(fs.readdirSync(input.directory)).toEqual([]);
});

it('uses successful Android signature verification and manifest inspection, excluding source stamps and secrets', () => {
  const signature = `Signer #1 certificate SHA-256 digest: ${certificate}\nSource Stamp Signer certificate SHA-256 digest: ${'e'.repeat(64)}\n`;
  const manifest = `package: name='${candidate.packageName}' versionCode='3' versionName='0.7.17'`;
  const tools = { buildTools: '/sdk/build-tools/35.0.0', env: { PATH: '/bin', JAVA_HOME: '/jdk', ANDROID_PLAY_SERVICE_ACCOUNT_JSON: 'secret' } };
  const run = vi.fn((bin, args, options) => {
    expect(options.env).toEqual({ PATH: '/bin', JAVA_HOME: '/jdk', LANG: 'C' });
    return bin.endsWith('apksigner') ? signature : manifest;
  });
  expect(inspectPlayApk('/download.apk', tools, run)).toEqual(actual);
  expect(run.mock.calls[0][1]).toEqual(['verify', '--verbose', '--print-certs', '/download.apk']);
  for (const badging of ['', `${manifest}\napplication-debuggable`, `${manifest}\napplication-testOnly`]) {
    expect(() => inspectPlayApk('/bad.apk', tools, bin => bin.endsWith('apksigner') ? signature : badging)).toThrow(/invalid/u);
  }
  expect(() => inspectPlayApk('/bad.apk', tools, () => { throw new Error('sensitive tool output'); })).toThrow('inspection failed');
  expect(() => inspectPlayApk('/bad.apk', tools, bin => bin.endsWith('apksigner') ? signature + signature : manifest)).toThrow(/invalid/u);
});
