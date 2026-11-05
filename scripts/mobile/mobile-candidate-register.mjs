/* global process, console */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';
import { MOBILE_REPOSITORY } from './mobile-candidate-provenance.mjs';
import { createMobileGithubApi, registerMobileCandidate } from './mobile-candidate-store.mjs';
import { readPlayRegistration } from './mobile-candidate-read.mjs';

export async function requireTrustedMobileRegistrar({ api, env, headSha }) {
  if (env.GITHUB_REPOSITORY !== MOBILE_REPOSITORY) throw new Error('Mobile registry repository differs');
  const repo = await api('GET', '');
  if (repo.default_branch !== 'dev') throw new Error('Trusted default branch changed; update the registration entry');
  const commit = await api('GET', 'commits/dev');
  if (!/^[a-f\d]{40}$/u.test(headSha) || headSha !== commit.sha) {
    throw new Error('Mobile registration must execute the current trusted default branch');
  }
}

export async function runMobileRegistration(env = process.env) {
  assertQualityCommandAllowed('runner:mobile-candidate-register', { env });
  const api = createMobileGithubApi(env.GH_TOKEN);
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await requireTrustedMobileRegistrar({ api, env, headSha });
  const payload = await readPlayRegistration(api, { runId: env.CANDIDATE_RUN_ID, artifactName: env.CANDIDATE_ARTIFACT, registrarSha: headSha });
  const registered = await registerMobileCandidate(api, payload);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `deployment_id=${registered.id}\n`);
  console.log(`[mobile-candidate] registered=${registered.id} source=${payload.sourceSha} run=${payload.runId}`);
  return registered.id;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { await runMobileRegistration(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
