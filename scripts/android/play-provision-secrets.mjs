/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { loadUploadSigning } from './macos-a5-upload-signing.mjs';
import { uploadSigningPassword } from './macos-a5-signing-password.mjs';

export function provisionPlaySecrets({ mode, configFile, serviceFile, root, java, run = spawnSync }) {
  if (!['--check', '--apply'].includes(mode)) throw new Error('Use --check or --apply with private signing and service-account files');
  const config = loadUploadSigning(configFile, root);
  if (!config) throw new Error('Existing upload signing configuration is required');
  const real = fs.realpathSync(serviceFile);
  const relative = path.relative(fs.realpathSync(root), real);
  if ((!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) || (fs.statSync(real).mode & 0o077)) {
    throw new Error('Service account JSON must be owner-only and outside the source repository');
  }
  const json = fs.readFileSync(real, 'utf8');
  const account = JSON.parse(json);
  if (account.type !== 'service_account' || !account.private_key || !account.client_email?.endsWith('.iam.gserviceaccount.com')) {
    throw new Error('Invalid dedicated Play service account');
  }
  if (createPrivateKey(account.private_key).asymmetricKeyType !== 'rsa') throw new Error('Play requires an RSA service account key');
  const password = uploadSigningPassword(config);
  const result = run(path.join(path.dirname(java), 'keytool'), ['-exportcert', '-rfc', '-keystore', config.keystore,
    '-alias', config.alias, '-storepass:env', 'FOLIOLE_ANDROID_UPLOAD_STORE_PASSWORD'], {
    encoding: 'utf8', env: { FOLIOLE_ANDROID_UPLOAD_STORE_PASSWORD: password }
  });
  if (result.error || result.status !== 0) throw new Error('Unable to verify the existing upload certificate');
  const expected = '3A:63:39:38:11:29:26:8C:65:1A:97:3F:A4:FF:A2:4F:F2:E3:E6:B3:32:F2:28:E4:E1:E0:AB:02:AF:BE:18:0B';
  if (new X509Certificate(result.stdout).fingerprint256 !== expected) throw new Error('Existing Play upload certificate differs');
  const values = { ANDROID_PLAY_SERVICE_ACCOUNT_JSON: json,
    ANDROID_UPLOAD_KEYSTORE_BASE64: fs.readFileSync(config.keystore).toString('base64'),
    ANDROID_UPLOAD_KEYSTORE_PASSWORD: password, ANDROID_UPLOAD_KEY_ALIAS: config.alias };
  for (const [name, input] of Object.entries(values)) {
    if (mode === '--apply') {
      const saved = run('gh', ['secret', 'set', name, '--repo', 'campfirium/foliole'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      if (saved.error || saved.status !== 0) throw new Error(`Secret configuration failed for ${name}; inspect names before retrying`);
    }
  }
  return Object.keys(values);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    const [mode, configFile, serviceFile] = process.argv.slice(2);
    const java = path.join(process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home', 'bin/java');
    console.log(JSON.stringify({ mode, secrets: provisionPlaySecrets({ mode, configFile, serviceFile, root: process.cwd(), java }) }));
  } catch { console.error('Play secret configuration failed; no credential details are logged'); process.exitCode = 1; }
}
