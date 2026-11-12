import { readMobileStatus } from '../mobile/mobile-candidate-phase.mjs';

export const PLAY_QUEUE_TASK = 'foliole-play-submission';
const ENVIRONMENT = 'foliole-play-beta-queue';
const PREFIX = 'Play submission: ';
const STATES = new Set(['waiting', 'admitted', 'submitted', 'blocked', 'cancelled', 'published', 'retired']);

export function verifyPlaySubmission(row) {
  const p = row?.payload;
  if (!Number.isSafeInteger(row?.id) || row.id < 1 || row.task !== PLAY_QUEUE_TASK || row.environment !== ENVIRONMENT ||
      row.creator?.login !== 'github-actions[bot]' || p?.schemaVersion !== 1 || p.kind !== PLAY_QUEUE_TASK ||
      row.sha !== p.sourceSha || !/^[a-f\d]{40}$/u.test(p.sourceSha ?? '') ||
      !/^[a-f\d]{40}$/u.test(p.registrarSha ?? '') || !/^[1-9]\d*$/u.test(p.runId ?? '') ||
      !/^\d+\.\d+\.\d+$/u.test(p.version ?? '') || !Number.isSafeInteger(p.jobId) || p.jobId < 1 ||
      !Number.isSafeInteger(p.attempt) || p.attempt < 1 || !Number.isSafeInteger(p.qualityArtifact?.id) ||
      !new RegExp(`^chain-verdict-${p.runId}-[1-9]\\d*$`, 'u').test(p.qualityArtifact?.name ?? '') ||
      !/^sha256:[a-f\d]{64}$/u.test(p.qualityArtifact?.digest ?? '') ||
      (p.prebuilt !== undefined && p.prebuilt !== true) || (p.directUpload !== undefined && (p.directUpload !== true || p.prebuilt !== true))
      || !Array.isArray(p.blockers) || (p.predecessor !== null && (!Number.isSafeInteger(p.predecessor) || p.predecessor < 1 || p.predecessor >= row.id))) {
    throw new Error('Durable Play submission identity differs');
  }
  for (const blocker of p.blockers) {
    if (typeof blocker.releaseName !== 'string' || !blocker.releaseName || !Array.isArray(blocker.codes) ||
        !blocker.codes.length || blocker.codes.some(code => !Number.isSafeInteger(code) || code < 1)) {
      throw new Error('Durable Play predecessor identity differs');
    }
  }
  return row;
}

export async function listPlaySubmissions(github) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const batch = await github('GET', `deployments?task=${PLAY_QUEUE_TASK}&environment=${ENVIRONMENT}&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Play submission queue is unavailable');
    rows.push(...batch.map(verifyPlaySubmission));
    if (batch.length < 100) return rows.sort((a, b) => a.id - b.id);
  }
}

export async function readPlaySubmissionState(github, row) {
  const { value, hasHistory } = await readMobileStatus(github, row.id, PREFIX);
  if (value === undefined) {
    if (!hasHistory) return 'waiting';
    const proof = await readMobileStatus(github, row.id, 'Play predecessors: ');
    if (proof.value === 'published') return 'waiting';
  }
  if (!STATES.has(value) && !/^resuming:[1-9]\d*$/u.test(value ?? '')) throw new Error('Unknown Play submission state');
  return value;
}

export async function writePlaySubmissionState(github, row, state) {
  if (!STATES.has(state) && !/^resuming:[1-9]\d*$/u.test(state)) throw new Error('Invalid Play submission state');
  await github('POST', `deployments/${row.id}/statuses`, { state: 'pending', description: `${PREFIX}${state}`,
    auto_inactive: false, log_url: `https://github.com/campfirium/foliole/actions/runs/${row.payload.runId}` });
}

export async function registerPlaySubmission(github, { evidence, registrarSha, blockers, prebuilt = false, directUpload = false }) {
  const rows = await listPlaySubmissions(github);
  const matches = rows.filter(row => row.payload.runId === String(evidence.run.id));
  if (matches.length > 1) throw new Error('Multiple queued submissions require reconciliation');
  if (matches.length) {
    if (matches[0].payload.sourceSha !== evidence.run.head_sha || matches[0].payload.version !== evidence.version ||
        matches[0].payload.qualityArtifact.digest !== evidence.qualityArtifact.digest) {
      throw new Error('Queued source identity changed');
    }
    return matches[0];
  }
  const payload = { schemaVersion: 1, kind: PLAY_QUEUE_TASK, sourceSha: evidence.run.head_sha,
    runId: String(evidence.run.id), version: evidence.version, jobId: evidence.jobId,
    attempt: evidence.run.run_attempt, registrarSha, qualityArtifact: evidence.qualityArtifact,
    predecessor: rows.at(-1)?.id ?? null, blockers, ...(prebuilt ? { prebuilt: true } : {}),
    ...(directUpload ? { directUpload: true } : {}) };
  return verifyPlaySubmission(await github('POST', 'deployments', { ref: payload.sourceSha, task: PLAY_QUEUE_TASK,
    environment: ENVIRONMENT, auto_merge: false, required_contexts: [], production_environment: false,
    transient_environment: false, description: 'Accepted Android source waiting for its submission turn', payload }));
}
