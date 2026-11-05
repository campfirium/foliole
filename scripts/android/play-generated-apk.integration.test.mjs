/* global process */
// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { collectPlayUniversalApk, inspectPlayApk } from './play-generated-apk.mjs';

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const tools = { buildTools: path.join(sdk ?? '/missing-android-sdk', 'build-tools/35.0.0'), env: process.env };
const identity = { sourceSha: 'a'.repeat(40), acceptedSha: 'a'.repeat(40), version: '0.7.17', runId: '42' };
const candidate = { schemaVersion: 1, ...identity, editId: '123', versionCode: 3, track: 'beta',
  packageName: 'com.campfirium.foliole.android', aabSha256: 'c'.repeat(64), phase: 'observed' };
let root, certificate, bytes;
function run(bin, args) {
  return execFileSync(bin, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
}

beforeAll(() => {
  if (!sdk || !process.env.JAVA_HOME) throw new Error('Android SDK and JDK 21 are required for APK integration coverage');
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  root = fs.mkdtempSync(path.resolve('.tmp/artifacts/play-apk-integration-'));
  const manifest = path.join(root, 'AndroidManifest.xml');
  fs.writeFileSync(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${candidate.packageName}" android:versionCode="3" android:versionName="0.7.17">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/>
    <application android:label="APK inspection fixture"/></manifest>`);
  const unsigned = path.join(root, 'unsigned.apk');
  run(path.join(tools.buildTools, 'aapt2'), ['link', '-I', path.join(sdk, 'platforms/android-36/android.jar'),
    '--manifest', manifest, '-o', unsigned]);
  const key = path.join(root, 'fixture.p12');
  const passwordFile = path.join(root, 'password');
  fs.writeFileSync(passwordFile, randomBytes(24).toString('hex'), { mode: 0o600 });
  const keytool = path.join(process.env.JAVA_HOME, 'bin/keytool');
  run(keytool, ['-genkeypair', '-alias', 'fixture', '-keystore', key, '-keyalg', 'RSA', '-validity', '1',
    '-dname', 'CN=Isolated APK test', '-storepass:file', passwordFile]);
  const der = run(keytool, ['-exportcert', '-alias', 'fixture', '-keystore', key, '-storepass:file', passwordFile]);
  certificate = createHash('sha256').update(der).digest('hex');
  const signed = path.join(root, 'signed.apk');
  run(path.join(tools.buildTools, 'apksigner'), ['sign', '--ks', key, '--ks-key-alias', 'fixture',
    '--ks-pass', `file:${passwordFile}`, '--out', signed, unsigned]);
  bytes = fs.readFileSync(signed);
});
afterAll(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

it('persists only a cryptographically verified APK and rejects real post-signing corruption without losing the previous result', async () => {
  const directory = path.join(root, 'collected');
  const input = { candidate, identity, certificateSha256: certificate, directory,
    api: async () => ({ generatedApks: [{ certificateSha256Hash: certificate,
      generatedUniversalApk: { downloadId: 'isolated-byte-boundary' } }] }),
    download: async () => bytes, inspect: file => inspectPlayApk(file, tools) };
  const receipt = await collectPlayUniversalApk(input);
  expect(receipt).toMatchObject({ packageName: candidate.packageName, versionCode: 3,
    certificateSha256: certificate, apkSha256: createHash('sha256').update(bytes).digest('hex') });
  const tampered = path.join(root, 'tampered.apk');
  fs.writeFileSync(tampered, bytes);
  const payload = path.join(root, 'payload.txt');
  fs.writeFileSync(payload, 'changed after signing');
  run(path.join(process.env.JAVA_HOME, 'bin/jar'), ['--update', '--file', tampered, '-C', root, 'payload.txt']);
  await expect(collectPlayUniversalApk({ ...input, download: async () => fs.readFileSync(tampered) }))
    .rejects.toThrow('signature or manifest inspection failed');
  expect(fs.readFileSync(path.join(directory, receipt.asset))).toEqual(bytes);
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'generated-apk.json')))).toEqual(receipt);
  expect(await collectPlayUniversalApk(input)).toEqual(receipt);
});
