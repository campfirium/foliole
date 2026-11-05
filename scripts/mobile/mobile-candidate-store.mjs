/* global AbortSignal, fetch */
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { MOBILE_REPOSITORY, MOBILE_TASK, PLAY_CANDIDATE_ENVIRONMENT, verifyMobileRegistrationPayload } from './mobile-candidate-provenance.mjs';

export function createMobileGithubApi(token, request = fetch, downloadArtifact) {
  if (!token) throw new Error('A scoped GitHub token is required');
  const download = downloadArtifact ?? (route => execFileSync('gh', ['api', `repos/${MOBILE_REPOSITORY}/${route}`], {
    env: { ...process.env, GH_TOKEN: token }, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  }));
  return async (method, route, body, binary = false) => {
    // GitHub CLI handles artifact redirects without a custom cross-origin credential path.
    if (binary) {
      if (method !== 'GET' || !/^actions\/artifacts\/[1-9]\d*\/zip$/u.test(route)) throw new Error('Exact GitHub artifact download is required');
      try { return await download(route); }
      catch { throw new Error('Original GitHub artifact could not be downloaded'); }
    }
    let response;
    try {
      response = await request(`https://api.github.com/repos/${MOBILE_REPOSITORY}${route ? `/${route}` : ''}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2026-03-10', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw new Error('GitHub candidate request outcome is unknown; reconcile the original candidate'); }
    if (!response.ok) throw new Error(`GitHub candidate request failed (HTTP ${response.status})`);
    if (method === 'POST' && /^actions\/jobs\/[1-9]\d*\/rerun$/u.test(route) && response.status === 201) return {};
    try { return await response.json(); }
    catch { throw new Error('GitHub candidate response is invalid; reconcile the original candidate'); }
  };
}

export async function listMobileCandidates(api, sha) {
  if (sha !== undefined && !/^[a-f\d]{40}$/u.test(sha)) throw new Error('An exact mobile source SHA is required');
  const entries = [];
  for (let page = 1; ; page += 1) {
    const rows = await api('GET', `deployments?task=${MOBILE_TASK}&environment=${PLAY_CANDIDATE_ENVIRONMENT}&per_page=100&page=${page}${sha ? `&sha=${sha}` : ''}`);
    if (!Array.isArray(rows)) throw new Error('Mobile candidate inventory is unavailable');
    entries.push(...rows);
    if (rows.length < 100) return entries;
  }
}

export function verifyStoredMobileCandidate(row) {
  const payload = row?.payload;
  verifyMobileRegistrationPayload(payload);
  if (!Number.isSafeInteger(row?.id) || row.task !== MOBILE_TASK || row.environment !== PLAY_CANDIDATE_ENVIRONMENT ||
      row.creator?.login !== 'github-actions[bot]' ||
      row.sha !== payload?.sourceSha || payload?.kind !== MOBILE_TASK || payload.schemaVersion !== 1 ||
      payload.platform !== 'android' || payload.repository !== MOBILE_REPOSITORY ||
      !/^[a-f\d]{40}$/u.test(payload.sourceSha ?? '') || !/^[1-9]\d*$/u.test(payload.runId ?? '') ||
      payload.candidate?.sourceSha !== payload.sourceSha || payload.candidate?.runId !== payload.runId ||
      !/^[a-f\d]{64}$/u.test(payload.candidate?.aabSha256 ?? '')) throw new Error('Stored mobile candidate identity differs');
  return row;
}

function sameCandidate(left, right) {
  return ['runId', 'sourceSha', 'version', 'versionCode', 'packageName', 'track', 'editId', 'aabSha256', 'certificateSha256']
    .every(key => left.candidate[key] === right.candidate[key]);
}

export async function registerMobileCandidate(api, payload) {
  verifyMobileRegistrationPayload(payload);
  const inventory = await listMobileCandidates(api, payload.sourceSha);
  const matches = inventory.filter(row => row.payload?.runId === payload.runId && row.payload?.platform === payload.platform);
  if (matches.length > 1) throw new Error('Multiple durable mobile candidates require reconciliation');
  if (matches.length) {
    const existing = verifyStoredMobileCandidate(matches[0]);
    if (!sameCandidate(existing.payload, payload)) throw new Error('Original mobile candidate changed; never upload a replacement automatically');
    return existing;
  }
  const row = await api('POST', 'deployments', { ref: payload.sourceSha, task: MOBILE_TASK,
    environment: PLAY_CANDIDATE_ENVIRONMENT, auto_merge: false, required_contexts: [],
    production_environment: false, transient_environment: false,
    description: 'Original signed Android candidate; upload outcome is not yet confirmed', payload });
  const verified = verifyStoredMobileCandidate(row);
  if (!isDeepStrictEqual(verified.payload, payload)) throw new Error('GitHub stored a different mobile candidate');
  return verified;
}
