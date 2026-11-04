/* global process, Buffer */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { releaseBundleInputs, verifyReleaseBundle } from './macos-a5-release-bundle.mjs';
import { signReleaseBundle } from './macos-a5-upload-signing.mjs';

function captured(bin, args, options = {}) {
  const result = spawnSync(bin, args, { ...options, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Android build command failed: ${path.basename(bin)}`);
  return result.stdout.trim();
}

export function buildPlayBundle(state, root, directory, env = process.env) {
  // Signing and API secrets must never be inherited by npm, Capacitor or Gradle.
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !/^(ANDROID_(?:UPLOAD|PLAY)|GH_TOKEN|GITHUB_TOKEN)/u.test(key)));
  clean.FOLIOLE_ANDROID_VERSION_CODE = String(state.versionCode);
  const identity = releaseBundleInputs(clean, root);
  if (identity.versionName !== state.version) throw new Error('Android product version differs');
  captured('npm', ['run', 'android:web:build'], { cwd: root, env: clean });
  captured(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], { cwd: root, env: clean });
  captured('./gradlew', ['--no-daemon', ':app:bundleRelease', `-PfolioleVersionCode=${state.versionCode}`,
    `-PfolioleVersionName=${state.version}`], { cwd: path.join(root, 'android'), env: clean });
  const bundle = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
  const verification = verifyReleaseBundle({ bundle, captured, env: clean, paths: { buildRoot: root }, identity });
  const artifact = path.join(directory, 'app-release-unsigned.aab');
  fs.copyFileSync(bundle, artifact);
  const digest = createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  fs.writeFileSync(path.join(directory, 'unsigned.json'), JSON.stringify({ artifact, digest, identity, verification,
    source: { revision: state.sourceSha }, productAcceptance: false, signing: 'unsigned' }));
}

export function signPlayBundle(directory, env = process.env) {
  const privateRoot = fs.mkdtempSync(path.join(env.RUNNER_TEMP, 'android-upload-'));
  try {
    const keystore = path.join(privateRoot, 'upload.jks');
    const passwordFile = path.join(privateRoot, 'password');
    fs.writeFileSync(keystore, Buffer.from(env.ANDROID_UPLOAD_KEYSTORE_BASE64 ?? '', 'base64'), { mode: 0o600 });
    fs.writeFileSync(passwordFile, env.ANDROID_UPLOAD_KEYSTORE_PASSWORD ?? '', { mode: 0o600 });
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'unsigned.json')));
    const java = path.join(env.JAVA_HOME, 'bin/java');
    const config = { keystore, passwordFile, alias: env.ANDROID_UPLOAD_KEY_ALIAS };
    const signed = signReleaseBundle({ receipt, config, java, env: { PATH: env.PATH, JAVA_HOME: env.JAVA_HOME } });
    const expected = '3A:63:39:38:11:29:26:8C:65:1A:97:3F:A4:FF:A2:4F:F2:E3:E6:B3:32:F2:28:E4:E1:E0:AB:02:AF:BE:18:0B';
    if (signed.certificateSha256 !== expected) throw new Error('Signing identity differs from the existing Play upload certificate');
    return signed;
  } finally { fs.rmSync(privateRoot, { recursive: true, force: true }); }
}
