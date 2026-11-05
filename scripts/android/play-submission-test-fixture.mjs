/* global fetch, URLSearchParams */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createMobileGithubApi, registerMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { createPlayRegistration } from '../mobile/mobile-candidate-provenance.mjs';
import { writeMobileCandidatePhase } from '../mobile/mobile-candidate-phase.mjs';
import { createPlayApi } from './play-api.mjs';
import { registrationFixture } from '../mobile/mobile-candidate-test-fixtures.mjs';
import { PLAY_ADMISSION_JOB } from './play-queue-evidence.mjs';

function addSource(f, root, id) {
  const source = registrationFixture();
  source.run.id = id; source.run.run_attempt = 1;
  source.run.head_sha = id.toString(16).padStart(40, 'a');
  source.run.display_title = `Dev Quality Check (full) @ ${source.run.head_sha.slice(0, 9)} [mobile:android]`;
  source.quality.run_id = String(id); source.quality.target_sha = source.run.head_sha;
  source.quality.accepted_sha = source.run.head_sha;
  for (const stage of Object.keys(source.quality.stage_shas)) source.quality.stage_shas[stage] = source.run.head_sha;
  source.qualityArtifact.id = id * 100 + 11;
  source.qualityArtifact.name = `chain-verdict-${id}-1`;
  source.qualityArtifact.workflow_run = { id, head_sha: source.run.head_sha };
  const folder = path.join(root, String(id)); mkdirSync(folder);
  writeFileSync(path.join(folder, 'chain-verdict.json'), JSON.stringify(source.quality));
  const zip = path.join(root, `${id}.zip`); execFileSync('zip', ['-q', zip, 'chain-verdict.json'], { cwd: folder });
  source.bytes = readFileSync(zip);
  source.qualityArtifact.digest = `sha256:${createHash('sha256').update(source.bytes).digest('hex')}`;
  source.jobs.push({ name: `mobile-android / ${PLAY_ADMISSION_JOB}`, id: id * 100 + 1 });
  f.sources.set(String(id), source);
  return source;
}

function createSubmissionServer(f) {
  return createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const route = request.url.replace(/^\/repos\/campfirium\/foliole\//u, '')
      .replace(/^\/androidpublisher\/v3\/applications\/com.campfirium.foliole.android\//u, '');
    const body = raw ? JSON.parse(raw) : undefined;
    f.calls.push({ method: request.method, route, body });
    const send = value => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
    if (route === 'tracks/beta/releases') return send({ releases: f.releases });
    if (route.startsWith('deployments?')) return send(f.rows.filter(row => new URLSearchParams(route.split('?')[1]).get('task') === row.task));
    if (route === 'deployments' && request.method === 'POST') {
      const row = { id: f.rows.length + 701, sha: body.ref, task: body.task, environment: body.environment,
        creator: { login: 'github-actions[bot]' }, payload: body.payload };
      f.rows.push(row);
      if (f.lostRegistration) { f.lostRegistration = false; response.destroy(); return; }
      return send(row);
    }
    const status = route.match(/^deployments\/(\d+)\/statuses/u);
    if (status) {
      const id = Number(status[1]); const history = f.histories.get(id) ?? [];
      if (request.method === 'POST') { history.unshift({ ...body, creator: { login: 'github-actions[bot]' } }); f.histories.set(id, history); return send(history[0]); }
      const page = Number(new URLSearchParams(route.split('?')[1]).get('page'));
      return send(history.slice((page - 1) * 100, page * 100));
    }
    const sourceRoute = route.match(/^actions\/runs\/(\d+)(.*)$/u);
    if (sourceRoute) {
      const source = f.sources.get(sourceRoute[1]); const suffix = sourceRoute[2];
      if (!suffix) return send(source.run);
      if (suffix.startsWith('/artifacts')) return send({ total_count: 1, artifacts: [source.qualityArtifact] });
      if (suffix.includes('/jobs')) return send({ total_count: source.jobs.length, jobs: source.jobs });
    }
    if (route.startsWith('actions/artifacts/')) {
      response.end([...f.sources.values()][0].bytes); return;
    }
    if (route.startsWith('contents/package.json')) return send({ encoding: 'base64',
      content: Buffer.from('{"version":"0.7.17"}').toString('base64') });
    const rerun = route.match(/^actions\/jobs\/(\d+)\/rerun$/u);
    if (rerun) {
      if (!f.loseBeforeDispatch) {
        const id = String(Math.floor(Number(rerun[1]) / 100));
        f.reruns.push(Number(rerun[1]));
        f.sources.get(id).run.run_attempt += 1; f.sources.get(id).run.status = 'in_progress';
      }
      if (f.lostDispatch || f.loseBeforeDispatch) { response.destroy(); return; }
      response.statusCode = 201; response.end(); return;
    }
    response.statusCode = 500; send({ unexpected: route });
  });
}

export async function submissionFixture() {
  mkdirSync('.tmp/artifacts/T725', { recursive: true });
  const root = mkdtempSync(path.resolve('.tmp/artifacts/T725/queue-'));
  const f = { rows: [], histories: new Map(), calls: [], releases: [], sources: new Map(), lostDispatch: false,
    lostRegistration: false, reruns: [], loseBeforeDispatch: false };
  f.addSource = (id = 42) => addSource(f, root, id);
  f.addSource();
  const server = createSubmissionServer(f);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = (url, options) => fetch(url.replace(/^https:\/\/[^/]+/u, `http://127.0.0.1:${server.address().port}`), options);
  f.clients = () => ({ github: createMobileGithubApi('test-token', request,
    route => [...f.sources.values()].find(source => source.qualityArtifact.id === Number(route.split('/')[2])).bytes), play: createPlayApi('test-token', request) });
  f.delivered = async (id, code, lifecycle) => {
    const source = f.sources.get(String(id));
    const candidate = { ...source.candidate, sourceSha: source.run.head_sha, acceptedSha: source.run.head_sha,
      runId: String(id), versionCode: code };
    const signedArtifact = { ...source.signedArtifact, name: `android-play-${id}-1-signed`,
      workflow_run: { id, head_sha: source.run.head_sha } };
    const registration = await registerMobileCandidate(f.clients().github,
      createPlayRegistration({ ...source, candidate, signedArtifact }));
    await writeMobileCandidatePhase(f.clients().github, registration.id, { ...candidate, phase: 'observed' });
    f.releases = [{ track: 'beta', releaseName: `${candidate.version}.${code}.${candidate.sourceSha.slice(0, 9)}`,
      activeArtifacts: [{ versionCode: code }], releaseLifecycleState: `RELEASE_LIFECYCLE_STATE_${lifecycle}` }];
    return registration;
  };
  f.env = (id = 42) => {
    const run = f.sources.get(String(id)).run;
    return { GITHUB_RUN_ID: String(id), GITHUB_RUN_ATTEMPT: String(run.run_attempt),
      GITHUB_SHA: run.head_sha, TARGET_SHA: run.head_sha, GITHUB_REF: 'refs/heads/check',
      TRIGGER_REF: 'refs/heads/check', TARGET_VERSION: '0.7.17', EXECUTION_LANE: 'qa-mobile-beta' };
  };
  f.release = state => { f.releases = [{ track: 'beta', releaseName: 'previous', activeArtifacts: [{ versionCode: 3 }],
    releaseLifecycleState: `RELEASE_LIFECYCLE_STATE_${state}` }]; };
  f.close = async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); };
  return f;
}
