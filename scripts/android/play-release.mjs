/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPlayApi, playAccessToken } from './play-api.mjs';
import { preparePlayCandidate, verifyPlayCandidate } from './play-distribution.mjs';
import { buildPlayBundle, signPlayBundle } from './play-build.mjs';
import { restorePlayCheckpoints } from './play-checkpoints.mjs';
import { createMobileGithubApi } from '../mobile/mobile-candidate-store.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';

export function playRunnerIdentity(env, root) {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
  const ref = { 'qa-mobile-beta': 'refs/heads/check', 'release-t7': 'refs/heads/release' }[env.EXECUTION_LANE];
  if (!ref || env.GITHUB_REF !== ref || env.TRIGGER_REF !== ref || env.GITHUB_SHA !== sourceSha ||
      env.TARGET_SHA !== sourceSha || env.ACCEPTED_SHA !== sourceSha || env.TARGET_VERSION !== version ||
      !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? '')) throw new Error('Play requires the exact accepted release or full QA candidate');
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
  if (!['prepare', 'inspect'].includes(command)) throw new Error('Use trusted durable delivery for Play upload, commit and observe');
  const api = createPlayApi(await playAccessToken(env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON));
  if (command === 'inspect') {
    const result = await api('GET', 'tracks/beta/releases');
    fs.writeFileSync(path.join(directory, 'play-status.json'), `${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'prepare') {
    if (!state) save(await preparePlayCandidate(api, identity,
      await readReservedPlayHistory(createMobileGithubApi(env.GH_TOKEN))));
    return;
  }

}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { await runPlayRelease(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
