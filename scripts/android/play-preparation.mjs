/* global console */
import process from 'node:process';
import path from 'node:path';
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createMobileGithubApi } from '../mobile/mobile-candidate-store.mjs';
import { requireTrustedMobileRegistrar } from '../mobile/mobile-candidate-register.mjs';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';
import { playAccessToken, createPlayApi } from './play-api.mjs';
import { registerAcceptedPlaySubmission } from './play-admission.mjs';
import { writePlaySubmissionState, readPlaySubmissionState } from './play-submission-store.mjs';
import { reservePlayVersion } from './play-version-reservation.mjs';

export async function preparePlaySubmission({ github, play, env, registrarSha }) {
  const row = await registerAcceptedPlaySubmission({ github, play, env, registrarSha, prebuilt: true });
  if (!row.payload.prebuilt) throw new Error('This original queued run uses the legacy build-after-review workflow');
  if (await readPlaySubmissionState(github, row) !== 'waiting') throw new Error('Original preparation is no longer waiting');
  await writePlaySubmissionState(github, row, 'waiting');
  const versionCode = await reservePlayVersion({ github, play, row });
  return { proceed: true, state: 'waiting', id: row.id, versionCode };
}

export async function runPlayPreparation(env = process.env) {
  assertQualityCommandAllowed('runner:mobile-candidate-register', { env });
  const github = createMobileGithubApi(env.GH_TOKEN);
  const registrarSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await requireTrustedMobileRegistrar({ api: github, env, headSha: registrarSha });
  const play = createPlayApi(await playAccessToken(env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON));
  const result = await preparePlaySubmission({ github, play, env, registrarSha });
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `proceed=true\nsubmission_state=waiting\n`);
  console.log(JSON.stringify(result));
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { await runPlayPreparation(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
