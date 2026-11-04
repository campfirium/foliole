/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPlayApi, playAccessToken, readPlayReleases } from './play-api.mjs';
import { preparePlayCandidate, verifyPlayCandidate, uploadPlayCandidate, commitPlayCandidate, observePlayCandidate } from './play-distribution.mjs';
import { buildPlayBundle, signPlayBundle } from './play-build.mjs';
import { restorePlayCheckpoints } from './play-checkpoints.mjs';

export function playRunnerIdentity(env, root) {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
  if (env.GITHUB_REF !== 'refs/heads/check' || env.TRIGGER_REF !== 'refs/heads/check' ||
      env.EXECUTION_LANE !== 'qa-mobile-beta' || env.GITHUB_SHA !== sourceSha ||
      env.TARGET_SHA !== sourceSha || env.ACCEPTED_SHA !== sourceSha || env.TARGET_VERSION !== version ||
      !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? '')) throw new Error('Play requires the exact accepted full QA candidate on check');
  return { sourceSha, acceptedSha: sourceSha, version, runId: env.GITHUB_RUN_ID };
}

function buildOrSign(command, state, root, directory, env, save) {
  if (command === 'build') {
    if (!state) throw new Error('Prepare the Play version allocation first');
    if (!fs.existsSync(path.join(directory, 'app-release-signed.aab'))) buildPlayBundle(state, root, directory, env);
    return true;
  }
  if (command === 'sign') {
    if (!state) throw new Error('Missing Play candidate');
    if (!fs.existsSync(path.join(directory, 'app-release-signed.aab'))) {
      const signed = signPlayBundle(directory, env);
      state.aabSha256 = signed.digest; state.certificateSha256 = signed.certificateSha256;
      state.phase = 'signed'; save(state);
    }
    return true;
  }
  return false;
}

export async function runPlayRelease(command, env = process.env) {
  const root = process.cwd();
  const identity = playRunnerIdentity(env, root);
  const directory = path.join(root, '.tmp/artifacts/android-play');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'candidate.json');
  const save = state => fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  if (command === 'restore') return restorePlayCheckpoints({ repository: env.GITHUB_REPOSITORY, runId: identity.runId, directory });
  if (command === 'guard') return;
  const state = fs.existsSync(file) ? verifyPlayCandidate(JSON.parse(fs.readFileSync(file)), identity) : null;
  if (buildOrSign(command, state, root, directory, env, save)) return;
  if (!['prepare', 'upload', 'commit', 'observe', 'inspect'].includes(command)) throw new Error('Unknown Play release action');
  const api = createPlayApi(await playAccessToken(env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON));
  if (command === 'inspect') {
    const result = await api('GET', 'tracks/beta/releases');
    fs.writeFileSync(path.join(directory, 'play-status.json'), `${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'prepare') {
    if (!state) save(await preparePlayCandidate(api, identity));
    return;
  }
  if (!state?.aabSha256) throw new Error('Missing signed candidate');
  const marker = path.join(directory, 'restored');
  const restored = fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === 'upload-may-have-started';
  if (restored && command === 'upload' && ['uploaded', 'commit-unknown', 'committed', 'observed'].includes(state.phase)) {
    const releases = await readPlayReleases(api);
    const name = `${state.version}.${state.versionCode}.${state.sourceSha.slice(0, 9)}`;
    if (releases.some(release => release.releaseName === name &&
        release.activeArtifacts?.some(item => Number(item.versionCode) === state.versionCode))) {
      state.releaseName = name;
      return observePlayCandidate({ api, state, save });
    }
  }
  if (command === 'upload' && ['prepared', 'signed', 'upload-unknown'].includes(state.phase)) {
    return uploadPlayCandidate({ api, state, bytes: fs.readFileSync(path.join(directory, 'app-release-signed.aab')), restored, save });
  }
  if (command === 'commit' && state.phase === 'uploaded') {
    return commitPlayCandidate({ api, state, notes: fs.readFileSync(path.join(root, 'scripts/android/play-release-notes.txt'), 'utf8'), save });
  }
  if (command === 'observe' || state.phase === 'commit-unknown') {
    const receipt = await observePlayCandidate({ api, state, save });
    console.log(`[android-play] ${receipt.version}/${receipt.versionCode}: ${receipt.releaseLifecycleState}`);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
      `Android ${receipt.version}/${receipt.versionCode}: ${receipt.releaseLifecycleState}\nSource: ${receipt.sourceSha}\n`);
    return receipt;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { await runPlayRelease(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
