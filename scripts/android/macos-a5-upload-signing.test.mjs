/* global process */
// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadUploadSigning, signReleaseBundle, verifyUploadBundle } from './macos-a5-upload-signing.mjs';

const macJava = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java';
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java')
  : fs.existsSync(macJava) ? macJava : 'java';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-signing-'));
const repo = path.join(root, 'repo');
const credentials = path.join(root, 'private');
const configFile = path.join(credentials, 'config.json');
const password = randomBytes(32).toString('hex');
const toolEnv = { FOLIOLE_ANDROID_UPLOAD_STORE_PASSWORD: password };
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let config;

function run(tool, args, env = {}) {
  const result = spawnSync(tool, args, { env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Fixture tool failed: ${path.basename(tool)}`);
}

function unsignedBundle(name) {
  const directory = path.join(repo, name);
  fs.mkdirSync(directory, { recursive: true });
  const payload = path.join(directory, 'payload.txt');
  const artifact = path.join(directory, 'app-release-unsigned.aab');
  fs.writeFileSync(payload, 'original release contents');
  run(path.join(path.dirname(java), 'jar'), ['--create', '--file', artifact, '-C', directory, 'payload.txt']);
  return { artifact, digest: hash(artifact), productAcceptance: false, signing: 'unsigned' };
}

beforeAll(() => {
  fs.mkdirSync(repo);
  fs.mkdirSync(credentials, { mode: 0o700 });
  const keystore = path.join(credentials, 'upload.p12');
  const passwordFile = path.join(credentials, 'password');
  fs.writeFileSync(passwordFile, password, { mode: 0o600 });
  run(path.join(path.dirname(java), 'keytool'), ['-genkeypair', '-alias', 'upload',
    '-keystore', keystore, '-storetype', 'PKCS12', '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10000', '-dname', 'CN=Upload signing test',
    '-storepass:env', 'FOLIOLE_ANDROID_UPLOAD_STORE_PASSWORD'], toolEnv);
  fs.chmodSync(keystore, 0o600);
  fs.writeFileSync(configFile, JSON.stringify({ keystore, passwordFile, alias: 'upload' }), { mode: 0o600 });
  config = loadUploadSigning(configFile, repo);
}, 30000);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('keeps unsigned source and produces an integrity verified upload signed sample with no secrets in receipt', () => {
  const receipt = unsignedBundle('success');
  const signed = signReleaseBundle({ receipt, config, java, env: {} });
  expect(hash(receipt.artifact)).toBe(receipt.digest);
  expect(signed).toMatchObject({ unsignedDigest: receipt.digest, signing: 'upload-key', allEntriesSigned: true });
  expect(signed.certificateSha256).toMatch(/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u);
  const record = fs.readFileSync(path.join(path.dirname(receipt.artifact), 'bundle.json'), 'utf8');
  expect(JSON.parse(record)).toMatchObject({ productAcceptance: false, uploadBundle: signed });
  for (const secret of [password, config.passwordFile, config.keystore]) expect(record).not.toContain(secret);
  fs.writeFileSync(path.join(path.dirname(receipt.artifact), 'payload.txt'), 'modified after signing');
  run(path.join(path.dirname(java), 'jar'), ['--update', '--file', signed.artifact,
    '-C', path.dirname(receipt.artifact), 'payload.txt']);
  expect(() => verifyUploadBundle({ artifact: signed.artifact, config, java, env: {} })).toThrow('jarsigner failed');
}, 30000);

it('rejects an unsigned archive and the wrong signer alias', () => {
  const receipt = unsignedBundle('failure');
  expect(() => verifyUploadBundle({ artifact: receipt.artifact, config, java, env: {} })).toThrow();
  expect(() => signReleaseBundle({ receipt, config: { ...config, alias: 'absent' }, java, env: {} }))
    .toThrow('jarsigner failed');
  expect(fs.existsSync(path.join(path.dirname(receipt.artifact), 'app-release-signed.aab'))).toBe(false);
  expect(hash(receipt.artifact)).toBe(receipt.digest);
}, 30000);

it('rejects shared credential permissions and repository contained credentials', () => {
  fs.chmodSync(config.passwordFile, 0o644);
  expect(() => loadUploadSigning(configFile, repo)).toThrow('Upload signing');
  fs.chmodSync(config.passwordFile, 0o600);
  const inside = path.join(repo, 'config.json');
  fs.copyFileSync(configFile, inside); fs.chmodSync(inside, 0o600);
  expect(() => loadUploadSigning(inside, repo)).toThrow('outside the repository');
  expect(loadUploadSigning(undefined, repo)).toBeNull();
});
