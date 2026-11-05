/* global console */
import process from 'node:process';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';
import { requireTrustedMobileRegistrar } from '../mobile/mobile-candidate-register.mjs';
import { createMobileGithubApi, listMobileCandidates, verifyStoredMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { playAccessToken, createPlayApi } from './play-api.mjs';
import { readPlayAvailability, readPlaySnapshot } from './play-availability-state.mjs';
import { checkRegisteredPlayAvailability } from './play-availability.mjs';

export async function checkPendingPlayCandidates({ github, play, candidateId }) {
  if (candidateId && !/^[1-9]\d*$/u.test(candidateId)) throw new Error('An exact durable candidate ID is required');
  const rows = await listMobileCandidates(github);
  const selected = rows.filter(row => !candidateId || String(row.id) === candidateId);
  if (candidateId && selected.length !== 1) throw new Error('Durable candidate was not found');
  const results = [];
  for (const entry of selected) {
    const row = verifyStoredMobileCandidate(entry);
    const previous = await readPlayAvailability(github, row.id);
    const snapshot = await readPlaySnapshot(github, row.id);
    if (!candidateId && snapshot === 'cleared' && ['available', 'rejected'].includes(previous)) continue;
    const state = await checkRegisteredPlayAvailability({ github, play, registration: row });
    results.push({ deploymentId: row.id, sourceSha: row.payload.sourceSha, versionCode: row.payload.candidate.versionCode, state });
  }
  return results;
}

export async function runPlayReviewCheck(env = process.env) {
  assertQualityCommandAllowed('runner:mobile-review-check', { env });
  if (env.GITHUB_REF !== 'refs/heads/dev' || !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('Mobile review checks require a trusted default-branch schedule or manual run');
  }
  const github = createMobileGithubApi(env.GH_TOKEN);
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await requireTrustedMobileRegistrar({ api: github, env, headSha });
  let api;
  const play = async (...args) => {
    api ??= createPlayApi(await playAccessToken(env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON));
    return api(...args);
  };
  const results = await checkPendingPlayCandidates({ github, play, candidateId: env.CANDIDATE_ID });
  console.log(JSON.stringify({ platform: 'android', candidates: results }));
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { await runPlayReviewCheck(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
