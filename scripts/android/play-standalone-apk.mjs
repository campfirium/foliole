/* global console, process, setTimeout */
// Builds a Play-signed standalone APK for the QA-accepted preview tip without a Play release:
// the signed AAB is committed as an internal-track draft that serves nobody, and Play's universal APK is kept.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createPlayApi, createPlayApkDownloader, playAccessToken, PLAY_PACKAGE } from './play-api.mjs';
import { buildPlayBundle, signPlayBundle } from './play-build.mjs';
import { inspectPlayApk, PLAY_APP_CERTIFICATE_SHA256, selectPlayUniversalApk } from './play-generated-apk.mjs';

const DIRECTORY = '.tmp/artifacts/android-standalone-apk';
const log = message => console.log(`[standalone-apk] ${message}`);

export function standaloneIdentity(env, root) {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const versionCode = Number(env.VERSION_CODE);
  if (env.TARGET_SHA !== sourceSha) throw new Error('Checked out source differs from the requested target');
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) throw new Error('VERSION_CODE is invalid');
  return { sourceSha, version, versionCode };
}

function requirePreviewTip(sourceSha, root) {
  // Only QA finish advances preview, so its tip is the accepted candidate.
  const tip = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/preview'], { cwd: root, encoding: 'utf8' }).split(/\s/u)[0];
  if (tip !== sourceSha) throw new Error(`Target ${sourceSha} is not the QA-accepted preview tip ${tip}`);
}

async function deliver(identity, root, env) {
  const directory = path.join(root, DIRECTORY);
  const bundleInfo = JSON.parse(fs.readFileSync(path.join(directory, 'bundle.json'), 'utf8'));
  if (bundleInfo.identity?.versionCode !== identity.versionCode || bundleInfo.source?.revision !== identity.sourceSha) {
    throw new Error('Signed bundle identity differs');
  }
  // A resumed run receives the AAB from an earlier run's artifact, so bind it to its signing receipt.
  const signedBundle = fs.readFileSync(path.join(directory, 'app-release-signed.aab'));
  if (createHash('sha256').update(signedBundle).digest('hex') !== bundleInfo.uploadBundle?.digest) throw new Error('Signed bundle digest differs');
  const token = await playAccessToken(env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON);
  const api = createPlayApi(token);
  const edit = await api('POST', 'edits', {});
  const base = `edits/${edit.id}`;
  try {
    const bundles = (await api('GET', `${base}/bundles`)).bundles ?? [];
    const highest = Math.max(0, ...bundles.map(entry => Number(entry.versionCode)));
    if (identity.versionCode <= highest) throw new Error(`Version code ${identity.versionCode} must exceed Play's highest ${highest}`);
    const uploaded = await api('POST', `${base}/bundles?uploadType=media`, signedBundle, true);
    if (Number(uploaded.versionCode) !== identity.versionCode) throw new Error('Play recorded a different version code');
    // Play keeps one draft per track: replace earlier standalone drafts and refuse to touch anyone else's.
    const current = (await api('GET', `${base}/tracks/internal`)).releases ?? [];
    const ownDraft = release => release.status === 'draft' && / standalone [\da-f]{9}$/u.test(release.name ?? '');
    if (current.some(release => release.status === 'draft' && !ownDraft(release))) {
      throw new Error('The internal track holds another draft; resolve it in Play Console first');
    }
    await api('PUT', `${base}/tracks/internal`, { track: 'internal', releases: [...current.filter(release => !ownDraft(release)),
      { name: `${identity.version} standalone ${identity.sourceSha.slice(0, 9)}`, versionCodes: [String(identity.versionCode)], status: 'draft' }] });
    await api('POST', `${base}:commit`, {});
    log(`version ${identity.versionCode} committed as an internal-track draft; nothing is served to users`);
  } catch (error) {
    await api('DELETE', base).catch(() => {});
    throw error;
  }
  let selected;
  for (let attempt = 1; !selected; attempt += 1) {
    try { selected = selectPlayUniversalApk(await api('GET', `generatedApks/${identity.versionCode}`), PLAY_APP_CERTIFICATE_SHA256); }
    catch (error) {
      if (attempt >= 30) throw error;
      log(`waiting for Play to generate the APK (${attempt}/30)`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  const name = `Foliole-Android-${identity.version}-${identity.versionCode}-${identity.sourceSha.slice(0, 9)}.apk`;
  const file = path.join(directory, name);
  fs.writeFileSync(file, await createPlayApkDownloader(token)(identity.versionCode, selected.downloadId));
  const inspected = inspectPlayApk(file, { buildTools: path.join(env.ANDROID_HOME, 'build-tools/35.0.0'), env });
  if (inspected.packageName !== PLAY_PACKAGE || inspected.versionCode !== identity.versionCode
      || inspected.version !== identity.version || inspected.certificateSha256 !== PLAY_APP_CERTIFICATE_SHA256) {
    throw new Error('Downloaded APK is not the Play-signed production package for this build');
  }
  const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(path.join(directory, `${name}.sha256`), `${digest}  ${name}\n`);
  log(`${name} sha256=${digest} certificate=${inspected.certificateSha256}`);
}

export async function runStandaloneApk(command, env = process.env, root = process.cwd()) {
  const identity = standaloneIdentity(env, root);
  const directory = path.join(root, DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  if (command === 'build') {
    requirePreviewTip(identity.sourceSha, root);
    return buildPlayBundle(identity, root, directory, env);
  }
  if (command === 'sign') return signPlayBundle(directory, env);
  if (command === 'deliver') return deliver(identity, root, env);
  throw new Error('Usage: play-standalone-apk.mjs build|sign|deliver');
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { await runStandaloneApk(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
