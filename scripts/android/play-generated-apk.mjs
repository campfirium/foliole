import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PLAY_PACKAGE } from './play-api.mjs';
import { verifyPlayCandidate } from './play-distribution.mjs';

export function normalizePlayCertificate(value) {
  if (typeof value !== 'string' || !/^(?:[a-f\d]{64}|(?:[a-f\d]{2}:){31}[a-f\d]{2})$/iu.test(value)) {
    throw new Error('An independently verified application signing certificate SHA256 is required');
  }
  return value.replaceAll(':', '').toLowerCase();
}

export function selectPlayUniversalApk(inventory, certificateSha256) {
  const expected = normalizePlayCertificate(certificateSha256);
  if (!Array.isArray(inventory?.generatedApks)) throw new Error('Generated APK inventory is unavailable');
  const matches = inventory.generatedApks.filter(entry =>
    normalizePlayCertificate(entry.certificateSha256Hash) === expected);
  if (matches.length !== 1) throw new Error('Exact application signing key is missing or ambiguous');
  const downloadId = matches[0].generatedUniversalApk?.downloadId;
  if (typeof downloadId !== 'string' || !downloadId.trim()) throw new Error('Play has not generated the universal APK');
  return { certificateSha256: expected, downloadId };
}

export function inspectPlayApk(file, { buildTools, env }, run = execFileSync) {
  // Only Android inspection tools receive this environment, never API credentials.
  const clean = { PATH: env.PATH, JAVA_HOME: env.JAVA_HOME, LANG: 'C' };
  const options = { env: clean, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] };
  let signature, badging;
  try {
    signature = run(path.join(buildTools, 'apksigner'), ['verify', '--verbose', '--print-certs', file], options);
    badging = run(path.join(buildTools, 'aapt2'), ['dump', 'badging', file], options);
  } catch { throw new Error('Generated APK signature or manifest inspection failed'); }
  const signers = [...signature.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f\d]{64})$/gimu)];
  const manifest = badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/mu);
  if (signers.length !== 1 || !manifest || /^(?:application-debuggable|application-testOnly)(?::|$)/mu.test(badging)) {
    throw new Error('Generated APK signer or production manifest is invalid');
  }
  return { packageName: manifest[1], versionCode: Number(manifest[2]), version: manifest[3],
    certificateSha256: normalizePlayCertificate(signers[0][1]) };
}

export async function collectPlayUniversalApk({ api, download, candidate, identity, certificateSha256,
  directory, inspect }) {
  verifyPlayCandidate(candidate, identity);
  if (!/^[a-f\d]{64}$/u.test(candidate.aabSha256 ?? '') ||
      !['uploaded', 'commit-unknown', 'committed', 'observed'].includes(candidate.phase)) {
    throw new Error('A confirmed original AAB upload is required');
  }
  const selected = selectPlayUniversalApk(await api('GET', `generatedApks/${candidate.versionCode}`), certificateSha256);
  const bytes = await download(candidate.versionCode, selected.downloadId);
  fs.mkdirSync(directory, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(directory, 'play-apk-'));
  try {
    const file = path.join(scratch, 'universal.apk');
    fs.writeFileSync(file, bytes);
    const actual = inspect(file);
    if (actual.packageName !== PLAY_PACKAGE || actual.versionCode !== candidate.versionCode ||
        actual.version !== identity.version || actual.certificateSha256 !== selected.certificateSha256) {
      throw new Error('Generated APK package, version or signing certificate differs');
    }
    const receipt = { schemaVersion: 1, ...identity, ...actual, aabSha256: candidate.aabSha256,
      apkSha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
    const asset = `Foliole-Android-${identity.version}.apk`;
    // Failed inspection never replaces a previously verified download or receipt.
    fs.renameSync(file, path.join(directory, asset));
    fs.writeFileSync(path.join(directory, 'generated-apk.json'), `${JSON.stringify({ ...receipt, asset }, null, 2)}\n`);
    return { ...receipt, asset };
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
