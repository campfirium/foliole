/* global console */
import process from 'node:process';
import path from 'node:path';
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';
import { createMobileGithubApi } from '../mobile/mobile-candidate-store.mjs';
import { requireTrustedMobileRegistrar } from '../mobile/mobile-candidate-register.mjs';
import { playAccessToken, createPlayApi, readPlayReleases } from './play-api.mjs';
import { readPrebuiltPlayCandidate } from './play-prebuilt-candidate.mjs';
import { readPlayQueueEvidence, PLAY_UPLOAD_ADMISSION_JOB } from './play-queue-evidence.mjs';
import { readPlaySubmissionState, registerPlaySubmission, writePlaySubmissionState } from './play-submission-store.mjs';
import { pendingPlayBlockers, playSubmissionContext, playSubmissionReadiness } from './play-submission-queue.mjs';

export async function registerAcceptedPlaySubmission({ github, play, env, registrarSha, prebuilt = false, upload = false }) {
  const evidence = await readPlayQueueEvidence(github, env.GITHUB_RUN_ID, upload ? PLAY_UPLOAD_ADMISSION_JOB : undefined);
  const { run, lane, version } = evidence;
  const branch = lane === 'release-t7' ? 'release' : 'check';
  if (run.status !== 'in_progress' || run.run_attempt !== Number(env.GITHUB_RUN_ATTEMPT) ||
      run.head_sha !== env.TARGET_SHA || env.GITHUB_SHA !== run.head_sha || env.TARGET_VERSION !== version ||
      env.GITHUB_REF !== `refs/heads/${branch}` || env.TRIGGER_REF !== env.GITHUB_REF ||
      env.EXECUTION_LANE !== (branch === 'release' ? 'release-t7' : 'qa-mobile-beta')) {
    throw new Error('Actual queued run differs from the accepted Android lane');
  }
  const directUpload = prebuilt && env.PLAY_DIRECT_UPLOAD === 'true';
  const releases = prebuilt && (!upload || directUpload) ? [] : await readPlayReleases(play);
  const row = await registerPlaySubmission(github, { evidence, registrarSha, prebuilt,
    blockers: pendingPlayBlockers(releases), directUpload });
  if (Boolean(row.payload.directUpload) !== directUpload) throw new Error('Original Play upload mode differs');
  return { row, releases };
}

export async function admitPlaySubmission({ github, play, env, registrarSha }) {
  const { row, releases } = await registerAcceptedPlaySubmission({ github, play, env, registrarSha,
    prebuilt: env.PLAY_PREBUILT === 'true', upload: env.PLAY_PREBUILT === 'true' });
  if (env.PLAY_PREBUILT === 'true' && !row.payload.prebuilt) throw new Error('Legacy submission must retain its original workflow');
  const prebuilt = row.payload.prebuilt ? await readPrebuiltPlayCandidate(github, row) : undefined;
  const artifactName = prebuilt?.signedArtifact.name;
  if (row.payload.directUpload) {
    const state = await readPlaySubmissionState(github, row);
    if (state === 'waiting') await writePlaySubmissionState(github, row, 'admitted');
    else if (!['admitted', 'submitted', 'published'].includes(state)) throw new Error('Original Play submission cannot proceed');
    return { proceed: true, state: state === 'waiting' ? 'admitted' : state, id: row.id, artifactName };
  }
  const context = await playSubmissionContext(github, () => releases);
  const previous = context.states.get(row.id);
  // Recovery of an admitted source belongs to its original checkpoint path.
  if (['submitted', 'published', 'admitted'].includes(previous)) return { proceed: true, state: previous, id: row.id, artifactName };
  const ready = playSubmissionReadiness(row, context);
  const state = previous === 'retired' ? 'retired' : ready === 'ready' ? 'admitted' : ready === 'blocked' ? 'blocked' : 'waiting';
  await writePlaySubmissionState(github, row, state);
  return { proceed: state === 'admitted', state, id: row.id, artifactName };
}

export async function runPlayAdmission(env = process.env) {
  assertQualityCommandAllowed('runner:mobile-candidate-register', { env });
  const github = createMobileGithubApi(env.GH_TOKEN);
  const registrarSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await requireTrustedMobileRegistrar({ api: github, env, headSha: registrarSha });
  const play = env.PLAY_DIRECT_UPLOAD === 'true' ? undefined :
    createPlayApi(await playAccessToken(env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON));
  const result = await admitPlaySubmission({ github, play, env, registrarSha });
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `proceed=${result.proceed}\nsubmission_state=${result.state}\nsigned_artifact=${result.artifactName ?? ''}\n`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,
    `Android submission: **${result.state}** (record ${result.id}).\n`);
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { await runPlayAdmission(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
