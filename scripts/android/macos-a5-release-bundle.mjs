/* global console */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const APP_ID = 'com.campfirium.foliole.android';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function releaseBundleInputs(env, root) {
  const raw = env.FOLIOLE_ANDROID_VERSION_CODE;
  if (!/^[1-9]\d*$/u.test(raw ?? '') || Number(raw) > 2100000000) {
    throw new Error('FOLIOLE_ANDROID_VERSION_CODE must be an integer from 1 to 2100000000.');
  }
  const forbidden = Object.entries(env).some(([key, value]) => value && value !== '0'
    && (key === 'FOLIOLE_ANDROID_DEV_LIVE_RELOAD'
      || key === 'FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID'
      || key === 'FOLIOLE_DATABASE_PERFORMANCE_SCENARIO'
      || key.startsWith('VITE_FOLIOLE_') && key.includes('ACCEPTANCE')));
  if (forbidden) throw new Error('Release bundles cannot use development or acceptance overrides.');
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(version ?? '')) {
    throw new Error('The source package must provide a product version.');
  }
  return { applicationId: APP_ID, versionCode: Number(raw), versionName: version };
}

export function verifyReleaseBundle({ bundle, captured, env, paths, identity }) {
  const entries = captured('/usr/bin/unzip', ['-Z1', bundle], { env }).split(/\r?\n/u);
  for (const entry of ['BundleConfig.pb', 'base/manifest/AndroidManifest.xml',
    'base/dex/classes.dex', 'base/assets/public/index.html']) {
    if (!entries.includes(entry)) throw new Error(`Release bundle is missing ${entry}.`);
  }
  if (entries.some((entry) => /^META-INF\/.*\.(?:RSA|DSA|EC|SF)$/iu.test(entry))) {
    throw new Error('Expected an unsigned engineering bundle.');
  }
  const readEntry = (entry) => captured('/usr/bin/unzip', ['-p', bundle, entry], { env });
  const config = JSON.parse(readEntry('base/assets/capacitor.config.json'));
  if (config.appId !== APP_ID || config.server?.url) {
    throw new Error('Release bundle contains a wrong app identity or live server URL.');
  }
  const manifest = fs.readFileSync(path.join(paths.buildRoot,
    'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml'), 'utf8');
  if (!manifest.includes(`package="${APP_ID}"`)
    || !manifest.includes(`android:versionCode="${identity.versionCode}"`)
    || !manifest.includes(`android:versionName="${identity.versionName}"`)
    || /android:(?:debuggable|testOnly)="true"/u.test(manifest)) {
    throw new Error('Release merged manifest does not match the requested identity.');
  }
  const index = fs.readFileSync(path.join(paths.buildRoot, 'dist/companion/index.html'), 'utf8').trim();
  if (readEntry('base/assets/public/index.html').trim() !== index) {
    throw new Error('Release bundle does not contain the newly built companion entry.');
  }
  return { mergedManifestDigest: digest(manifest), webIndexDigest: digest(index) };
}

function preserveBundle({ bundle, captured, env, paths, identity, verification }) {
  const root = path.join(paths.artifactsRoot, 'android-release-bundle', paths.runId);
  fs.mkdirSync(root, { recursive: true });
  const destination = path.join(root, 'app-release-unsigned.aab');
  fs.copyFileSync(bundle, destination, fs.constants.COPYFILE_EXCL);
  const git = (args) => captured('git', args, { cwd: paths.sourceRepoRoot, env });
  const source = paths.acceptedRevision ? { revision: paths.acceptedRevision,
    tree: paths.acceptedTree, archiveDigest: paths.sourceArchiveDigest } : {
    revision: git(['rev-parse', 'HEAD']),
    worktreeDirty: Boolean(git(['status', '--porcelain', '--untracked-files=normal']))
  };
  const receipt = { artifact: destination, digest: digest(fs.readFileSync(destination)),
    identity, source, verification, signing: 'unsigned', purpose: 'engineering-build-only',
    productAcceptance: false, runId: paths.runId };
  fs.writeFileSync(path.join(root, 'bundle.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[macos-a5-dev] unsigned release bundle=${destination}`);
  return receipt;
}

export function buildReleaseBundle({ checked, captured, env, paths }) {
  const identity = releaseBundleInputs(env, paths.buildRoot);
  const bundle = path.join(paths.buildRoot, 'android/app/build/outputs/bundle/release/app-release.aab');
  fs.rmSync(bundle, { force: true });
  checked('npm', ['run', 'android:web:build'], { cwd: paths.buildRoot, env });
  checked(paths.cap, ['sync', 'android'], { cwd: paths.buildRoot, env });
  checked(paths.gradle, ['--no-daemon', '--build-cache', ':app:bundleRelease',
    `-PfolioleVersionCode=${identity.versionCode}`, `-PfolioleVersionName=${identity.versionName}`],
  { cwd: path.join(paths.buildRoot, 'android'), env });
  if (!fs.existsSync(bundle)) throw new Error('Release AAB was not produced.');
  const verification = verifyReleaseBundle({ bundle, captured, env, paths, identity });
  return preserveBundle({ bundle, captured, env, paths, identity, verification });
}
