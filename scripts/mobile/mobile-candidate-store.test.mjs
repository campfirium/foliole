/* global fetch */
// @vitest-environment node
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { createPlayRegistration, MOBILE_TASK, PLAY_CANDIDATE_ENVIRONMENT } from './mobile-candidate-provenance.mjs';
import { createMobileGithubApi, listMobileCandidates, registerMobileCandidate, verifyStoredMobileCandidate } from './mobile-candidate-store.mjs';
import { registrationFixture } from './mobile-candidate-test-fixtures.mjs';

it('recovers the same durable pre-upload candidate after a lost response and independent client restart', async () => {
  const payload = createPlayRegistration(registrationFixture());
  const rows = []; const calls = []; let loseResponse = true;
  const server = createServer(async (request, response) => {
    let input = ''; for await (const chunk of request) input += chunk;
    calls.push({ method: request.method, url: request.url, input });
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST') {
      const body = JSON.parse(input);
      const row = { id: 701, sha: body.ref, task: body.task, environment: body.environment,
        creator: { login: 'github-actions[bot]' }, payload: body.payload };
      rows.push(row);
      if (loseResponse) { loseResponse = false; response.destroy(); return; }
      response.end(JSON.stringify(row));
    } else response.end(JSON.stringify(rows));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = () => createMobileGithubApi('scoped-test-token', (url, options) => {
    expect(options.redirect).toBe('error');
    return fetch(url.replace('https://api.github.com', `http://127.0.0.1:${server.address().port}`), options);
  });
  try {
    await expect(registerMobileCandidate(client(), payload)).rejects.toThrow(/outcome is unknown/u);
    const restored = await registerMobileCandidate(client(), payload);
    expect(restored.payload.candidate).toEqual(payload.candidate);
    expect(restored.id).toBe(701);
    expect(await listMobileCandidates(client())).toEqual([restored]);
    const posts = calls.filter(call => call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].input)).toMatchObject({ ref: payload.sourceSha, task: MOBILE_TASK,
      environment: PLAY_CANDIDATE_ENVIRONMENT, auto_merge: false, required_contexts: [],
      production_environment: false, transient_environment: false });
    await expect(registerMobileCandidate(client(), { ...payload,
      candidate: { ...payload.candidate, aabSha256: 'f'.repeat(64) } })).rejects.toThrow(/Original mobile candidate changed/u);
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1);
    rows.push({ ...restored, id: 702 });
    await expect(registerMobileCandidate(client(), payload)).rejects.toThrow(/Multiple durable/u);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

it('refuses malformed persisted facts and sanitizes API failures without executing response data', async () => {
  const payload = createPlayRegistration(registrationFixture());
  const row = { id: 1, sha: payload.sourceSha, task: MOBILE_TASK, environment: PLAY_CANDIDATE_ENVIRONMENT,
    payload, creator: { login: 'github-actions[bot]' } };
  expect(verifyStoredMobileCandidate(row)).toBe(row);
  for (const patch of [{ sha: 'f'.repeat(40) }, { creator: { login: 'external' } }, { environment: 'production' }]) {
    expect(() => verifyStoredMobileCandidate({ ...row, ...patch })).toThrow();
  }
  await expect(listMobileCandidates(async () => ({}))).rejects.toThrow(/unavailable/u);
  await expect(listMobileCandidates(async () => [], 'branch')).rejects.toThrow(/exact/u);
  const failed = createMobileGithubApi('secret', async () => ({ ok: false, status: 403 }));
  await expect(failed('POST', 'deployments', payload)).rejects.toThrow('GitHub candidate request failed (HTTP 403)');
  const corrupt = createMobileGithubApi('secret', async () => ({ ok: true, json: async () => { throw new Error('secret'); } }));
  await expect(corrupt('GET', 'deployments')).rejects.toThrow('GitHub candidate response is invalid');
});

it('uses the existing artifact client only for exact binary downloads and does not follow API redirects itself', async () => {
  const routes = [];
  const api = createMobileGithubApi('scoped', async () => { throw new Error('JSON transport must not receive artifact redirects'); },
    route => { routes.push(route); return new Uint8Array([80, 75]); });
  expect(await api('GET', 'actions/artifacts/42/zip', undefined, true)).toEqual(new Uint8Array([80, 75]));
  await expect(api('GET', '../untrusted', undefined, true)).rejects.toThrow(/Exact GitHub artifact/u);
  expect(routes).toEqual(['actions/artifacts/42/zip']);
});
