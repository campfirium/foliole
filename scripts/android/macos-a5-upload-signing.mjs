import fs from 'node:fs';
import path from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';

function privateFile(file, sourceRepoRoot) {
  if (!path.isAbsolute(file)) throw new Error('Upload signing files require absolute paths.');
  const real = fs.realpathSync(file);
  const relative = path.relative(fs.realpathSync(sourceRepoRoot), real);
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    throw new Error('Upload signing credentials must be outside the source repository.');
  }
  const stat = fs.statSync(real);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
    throw new Error('Upload signing credential files must be private to their owner (0600).');
  }
  return real;
}

export function loadUploadSigning(configFile, sourceRepoRoot) {
  if (!configFile) return null;
  try {
    const file = privateFile(configFile, sourceRepoRoot);
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!/^[a-zA-Z0-9._-]+$/u.test(config.alias ?? '')) throw new Error('Invalid key alias.');
    return { alias: config.alias,
      keystore: privateFile(config.keystore, sourceRepoRoot),
      passwordFile: privateFile(config.passwordFile, sourceRepoRoot) };
  } catch {
    throw new Error('Upload signing configuration is missing, invalid, or not privately stored outside the repository.');
  }
}

function javaTool(java, tool, args, env) {
  const result = spawnSync(path.join(path.dirname(java), tool), args,
    { env, encoding: 'utf8', timeout: 120000 });
  if (result.error || result.status !== 0) {
    // Do not forward tool diagnostics: credentials must never reach logs on failure.
    throw new Error(`Upload signing ${tool} failed (exit ${result.status ?? 'unavailable'}).`);
  }
  return result.stdout;
}

function signingEnv(config, env) {
  const password = fs.readFileSync(config.passwordFile, 'utf8').trimEnd();
  if (!password || /[\r\n]/u.test(password)) throw new Error('Upload signing password file is invalid.');
  // Only the signing tools receive the secret; Gradle, npm and Capacitor do not.
  return { ...env, FOLIOLE_ANDROID_UPLOAD_STORE_PASSWORD: password };
}

export function verifyUploadBundle({ artifact, config, java, env }) {
  const secretEnv = signingEnv(config, env);
  const storeArgs = ['-keystore', config.keystore,
    '-storepass:env', 'FOLIOLE_ANDROID_UPLOAD_STORE_PASSWORD'];
  javaTool(java, 'jarsigner', ['-verify', '-strict', ...storeArgs, artifact, config.alias], secretEnv);
  const expected = javaTool(java, 'keytool', ['-exportcert', '-rfc', ...storeArgs,
    '-alias', config.alias], secretEnv);
  const actual = javaTool(java, 'keytool', ['-printcert', '-rfc', '-jarfile', artifact], env);
  const certificate = new X509Certificate(expected);
  if (new X509Certificate(actual).fingerprint256 !== certificate.fingerprint256) {
    throw new Error('Upload signing certificate does not match the configured upload key.');
  }
  return { certificateSha256: certificate.fingerprint256,
    validTo: certificate.validTo, archiveIntegrity: 'verified', allEntriesSigned: true,
    trust: 'verified-against-local-upload-keystore', timestamped: false };
}

export function signReleaseBundle({ receipt, config, java, env }) {
  const artifact = path.join(path.dirname(receipt.artifact), 'app-release-signed.aab');
  if (fs.existsSync(artifact)) throw new Error('Upload signed bundle already exists.');
  try {
    javaTool(java, 'jarsigner', ['-keystore', config.keystore,
      '-storepass:env', 'FOLIOLE_ANDROID_UPLOAD_STORE_PASSWORD',
      '-keypass:env', 'FOLIOLE_ANDROID_UPLOAD_STORE_PASSWORD',
      '-digestalg', 'SHA-256', '-sigalg', 'SHA256withRSA',
      '-signedjar', artifact, receipt.artifact, config.alias], signingEnv(config, env));
    const verification = verifyUploadBundle({ artifact, config, java, env });
    const signed = { artifact, digest: createHash('sha256').update(fs.readFileSync(artifact)).digest('hex'),
      unsignedDigest: receipt.digest, signing: 'upload-key', ...verification };
    fs.writeFileSync(path.join(path.dirname(artifact), 'bundle.json'),
      `${JSON.stringify({ ...receipt, uploadBundle: signed }, null, 2)}\n`);
    return signed;
  } catch (error) {
    fs.rmSync(artifact, { force: true });
    throw error;
  }
}
