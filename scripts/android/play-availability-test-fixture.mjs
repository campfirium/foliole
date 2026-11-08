/* global fetch, URL */
import { createServer } from 'node:http';
import { createPlayRegistration, MOBILE_TASK, PLAY_CANDIDATE_ENVIRONMENT } from '../mobile/mobile-candidate-provenance.mjs';
import { registrationFixture } from '../mobile/mobile-candidate-test-fixtures.mjs';
import { createMobileGithubApi } from '../mobile/mobile-candidate-store.mjs';
import { createPlayApi } from './play-api.mjs';

export async function availabilityFixture() {
  const payload = createPlayRegistration(registrationFixture());
  const row = { id: 71, sha: payload.sourceSha, task: MOBILE_TASK, environment: PLAY_CANDIDATE_ENVIRONMENT,
    creator: { login: 'github-actions[bot]' }, payload };
  const status = description => ({ description, creator: { login: 'github-actions[bot]' } });
  const histories = new Map([[71, [status('Play candidate: observed')]]]);
  const f = { row, rows: [row], histories, calls: [], edits: new Set(), lifecycle: 'IN_REVIEW',
    releaseName: '0.7.17.4.aaaaaaaaa', track: { track: 'beta', releases: [
      { name: '0.7.17.4.aaaaaaaaa', versionCodes: ['4'], status: 'completed' }] } };
  let nextId = 900;
  const respond = (response, value, code = 200) => {
    response.writeHead(code, { 'content-type': 'application/json' }); response.end(JSON.stringify(value));
  };
  const server = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    const route = request.url; const method = request.method;
    f.calls.push({ method, route, body });
    if (route.startsWith('/repos/')) {
      const match = /deployments\/(\d+)\/statuses/u.exec(route);
      if (match) {
        const history = histories.get(Number(match[1])) ?? [];
        if (method === 'POST') {
          if (f.failStatus === body.description) { f.failStatus = undefined; respond(response, {}, 500); return; }
          history.unshift(status(body.description)); respond(response, { id: history.length }); return;
        }
        const page = Number(new URL(route, 'http://local').searchParams.get('page') ?? 1);
        respond(response, history.slice((page - 1) * 100, page * 100)); return;
      }
      respond(response, f.rows.filter(row => row.task === new URL(route, 'http://local').searchParams.get('task'))); return;
    }
    if (route.endsWith('/tracks/beta/releases')) {
      respond(response, { releases: f.absent ? [] : [{ track: 'beta', releaseName: f.releaseName,
        activeArtifacts: [{ versionCode: 4 }], releaseLifecycleState: `RELEASE_LIFECYCLE_STATE_${f.lifecycle}` }, ...(f.extraReleases ?? [])] }); return;
    }
    if (method === 'POST' && route.endsWith('/edits')) {
      const id = f.nextEditId ?? String(nextId + 1);
      nextId += 1; f.nextEditId = undefined; f.edits.add(id);
      if (f.loseCreate) { f.loseCreate = false; response.destroy(); return; }
      respond(response, { id }); return;
    }
    const encodedEdit = /\/edits\/([^/:?]+)/u.exec(route)?.[1];
    const edit = encodedEdit ? decodeURIComponent(encodedEdit) : null;
    if (method === 'DELETE' && edit) {
      const existed = f.edits.delete(edit);
      if (f.loseDelete) { f.loseDelete = false; response.destroy(); return; }
      respond(response, {}, existed ? 200 : 404); return;
    }
    if (method === 'GET' && edit && route.endsWith('/tracks/beta')) {
      if (f.failTrack) { respond(response, {}, 403); return; }
      if (f.changeDuringRead) f.lifecycle = 'APPROVED_NOT_PUBLISHED';
      respond(response, f.track); return;
    }
    respond(response, {}, 500);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = (url, options) => fetch(url.replace(/^https:\/\/[^/]+/u, `http://127.0.0.1:${server.address().port}`), options);
  f.clients = () => ({ github: createMobileGithubApi('test-token', request), play: createPlayApi('test-token', request), registration: row });
  f.close = () => new Promise(resolve => server.close(resolve));
  f.status = status;
  return f;
}
