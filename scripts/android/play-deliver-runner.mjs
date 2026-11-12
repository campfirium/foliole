/* global process, console */
import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';
import { requireTrustedMobileRegistrar } from '../mobile/mobile-candidate-register.mjs';
import { createMobileGithubApi, listMobileCandidates, registerMobileCandidate, verifyStoredMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { extractSignedPlayArchive, readPlayRegistration } from '../mobile/mobile-candidate-read.mjs';
import { MOBILE_REPOSITORY } from '../mobile/mobile-candidate-provenance.mjs';
import { playAccessToken, createPlayApi, createPlayApkDownloader } from './play-api.mjs';
import { requirePlayReservation } from './play-preparation-state.mjs';
import { deliverRegisteredPlayCandidate } from './play-delivery.mjs';
import { collectPlayUniversalApk, inspectPlayApk, PLAY_APP_CERTIFICATE_SHA256 } from './play-generated-apk.mjs';
import { verifyPlayDexIdentity } from './play-dex-identity.mjs';

export async function resolvePlayDeliveryRegistration(github, env, registrarSha) {
  const runId = env.GITHUB_RUN_ID;
  if (!/^[1-9]\d*$/u.test(runId ?? '')) throw new Error('Original distribution run is required');
  const run = await github('GET', `actions/runs/${runId}`);
  const branch = { 'release-t7': 'release', 'qa-mobile-beta': 'check' }[env.EXECUTION_LANE];
  const workflow = branch === 'release' ? '.github/workflows/t7-release.yml' : '.github/workflows/remote-quality.yml';
  if (!branch || run.head_branch !== branch || run.path !== workflow || run.status !== 'in_progress' ||
      !['push', 'workflow_dispatch'].includes(run.event) || run.head_repository?.full_name !== MOBILE_REPOSITORY ||
      run.head_sha !== env.TARGET_SHA || env.GITHUB_SHA !== run.head_sha ||
      env.GITHUB_REF !== `refs/heads/${branch}` || env.TRIGGER_REF !== env.GITHUB_REF ||
      run.run_attempt !== Number(env.GITHUB_RUN_ATTEMPT)) throw new Error('Actual delivery run differs from the accepted lane');
  const rows = (await listMobileCandidates(github, run.head_sha)).filter(row => row.payload?.runId === runId);
  if (rows.length > 1) throw new Error('Original delivery has multiple durable candidates');
  let row;
  if (rows.length) row = verifyStoredMobileCandidate(rows[0]);
  else {
    const payload = await readPlayRegistration(github, { runId, artifactName: env.CANDIDATE_ARTIFACT, registrarSha });
    await requirePlayReservation(github, payload.candidate);
    row = await registerMobileCandidate(github, payload);
  }
  await requirePlayReservation(github, row.payload.candidate);
  if (row.payload.candidate.version !== env.TARGET_VERSION || row.payload.workflow !== workflow ||
      row.payload.sourceSha !== run.head_sha) throw new Error('Durable delivery candidate differs');
  return row;
}

async function originalBundle(github, registration) {
  const origin = registration.payload;
  const archive = await github('GET', `actions/artifacts/${origin.signedArtifact.id}/zip`, undefined, true);
  if (`sha256:${createHash('sha256').update(archive).digest('hex')}` !== origin.signedArtifact.digest) {
    throw new Error('Original signed checkpoint changed');
  }
  const extracted = extractSignedPlayArchive(archive);
  if (extracted.candidate.aabSha256 !== origin.candidate.aabSha256) throw new Error('Original AAB digest differs');
  verifyPlayDexIdentity(extracted.candidate.dexSha256, origin.dexSha256);
  return extracted.bundle;
}

export async function runPlayDelivery(env = process.env) {
  assertQualityCommandAllowed('runner:mobile-candidate-register', { env });
  const github = createMobileGithubApi(env.GH_TOKEN);
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await requireTrustedMobileRegistrar({ api: github, env, headSha });
  const registration = await resolvePlayDeliveryRegistration(github, env, headSha);
  const candidate = registration.payload.candidate;
  const reservation = await requirePlayReservation(github, candidate);
  const directUpload = reservation?.payload.directUpload === true;
  const notes = await github('GET', `contents/scripts/android/play-release-notes.txt?ref=${candidate.sourceSha}`);
  if (notes.encoding !== 'base64') throw new Error('Original release notes are unavailable');
  const token = await playAccessToken(env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON);
  const play = createPlayApi(token);
  const directory = '.tmp/artifacts/android-play'; fs.mkdirSync(directory, { recursive: true });
  const saveCheckpoint = value => fs.writeFileSync(path.join(directory, 'candidate.json'), `${JSON.stringify(value, null, 2)}\n`);
  const state = await deliverRegisteredPlayCandidate({ github, play, registration,
    loadBundle: () => originalBundle(github, registration), saveCheckpoint, directUpload,
    notes: Buffer.from(notes.content, 'base64').toString('utf8') });
  if (env.EXECUTION_LANE === 'release-t7') await collectReleaseApk({ env, play, token, state, registration, directUpload });
  console.log(`[android-play] ${state.version}/${state.versionCode}: ${state.releaseLifecycleState ?? state.phase}; candidate=${registration.id}`);
  return state;
}

async function collectReleaseApk({ env, play, token, state, registration, directUpload }) {
  const directory = '.tmp/artifacts/android-play-release';
  const identity = { sourceSha: state.sourceSha, acceptedSha: state.acceptedSha, version: state.version, runId: state.runId };
  const receipt = await collectPlayUniversalApk({ api: play, download: createPlayApkDownloader(token), candidate: state,
    identity, certificateSha256: PLAY_APP_CERTIFICATE_SHA256, expectedDexSha256: registration.payload.dexSha256,
    directory, inspect: file => inspectPlayApk(file, {
      buildTools: path.join(env.ANDROID_HOME, 'build-tools/35.0.0'), env }) });
  const exported = { ...receipt, channel: 'play-beta', deploymentId: registration.id,
    releaseName: state.releaseName, ...(directUpload ? { schemaVersion: 2, submissionState: 'committed' } :
      { releaseLifecycleState: state.releaseLifecycleState }) };
  fs.writeFileSync(path.join(directory, `Foliole-Android-${state.version}-Play.json`), `${JSON.stringify(exported, null, 2)}\n`);
  fs.rmSync(path.join(directory, 'generated-apk.json'));
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT,
    `artifact_name=release-android-${state.sourceSha}-${env.GITHUB_RUN_ATTEMPT}\npackaged_sha=${state.sourceSha}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { await runPlayDelivery(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
