import { readPlayReleases } from './play-api.mjs';
import { listMobileCandidates, verifyStoredMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { readMobileStatus, readMobileCandidatePhase } from '../mobile/mobile-candidate-phase.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { readPrebuiltPlayCandidate } from './play-prebuilt-candidate.mjs';
import { readPlayQueueEvidence, PLAY_UPLOAD_ADMISSION_JOB } from './play-queue-evidence.mjs';
import { listPlaySubmissions, readPlaySubmissionState, writePlaySubmissionState } from './play-submission-store.mjs';

const PUBLISHED = 'RELEASE_LIFECYCLE_STATE_PUBLISHED';
const REJECTED = 'RELEASE_LIFECYCLE_STATE_NOT_APPROVED';
const PENDING = new Set(['DRAFT', 'NOT_SENT_FOR_REVIEW', 'IN_REVIEW', 'APPROVED_NOT_PUBLISHED']
  .map(state => `RELEASE_LIFECYCLE_STATE_${state}`));

export function pendingPlayBlockers(releases) {
  for (const row of releases) {
    if (![PUBLISHED, REJECTED].includes(row.releaseLifecycleState) && !PENDING.has(row.releaseLifecycleState)) {
      throw new Error('Unknown Play review state; preserve the queue');
    }
  }
  return releases.filter(row => PENDING.has(row.releaseLifecycleState))
    .map(row => ({ releaseName: row.releaseName, codes: (row.activeArtifacts ?? []).map(item => Number(item.versionCode)) }));
}

function predecessorResult(blocker, releases) {
  const found = releases.filter(row => row.releaseName === blocker.releaseName &&
    blocker.codes.every(code => row.activeArtifacts?.some(item => Number(item.versionCode) === code)));
  if (found.length !== 1) return 'waiting';
  if (found[0].releaseLifecycleState === REJECTED) return 'blocked';
  return found[0].releaseLifecycleState === PUBLISHED ? 'ready' : 'waiting';
}

export async function playSubmissionContext(github, play) {
  const rows = await listPlaySubmissions(github);
  const releases = await readPlayReleases(play);
  pendingPlayBlockers(releases);
  const candidates = (await listMobileCandidates(github)).map(verifyStoredMobileCandidate);
  const states = new Map();
  const clearedBlockers = new Set();
  for (const row of rows) {
    let state = await readPlaySubmissionState(github, row);
    const candidate = candidates.find(item => item.payload.runId === row.payload.runId);
    if (['admitted', 'submitted'].includes(state) && candidate &&
        await readMobileCandidatePhase(github, candidate.id) === 'observed') {
      const original = candidate.payload.candidate;
      const result = predecessorResult({ releaseName: `${original.version}.${original.versionCode}.${original.sourceSha.slice(0, 9)}`,
        codes: [original.versionCode] }, releases);
      const next = { ready: 'published', blocked: 'blocked', waiting: 'submitted' }[result];
      if (next !== state) { await writePlaySubmissionState(github, row, next); state = next; }
    }
    const proof = await readMobileStatus(github, row.id, 'Play predecessors: ');
    if (proof.value !== undefined && proof.value !== 'published') throw new Error('Unknown predecessor publication proof');
    if (proof.value === 'published' || row.payload.blockers.every(blocker => predecessorResult(blocker, releases) === 'ready')) {
      clearedBlockers.add(row.id);
      if (!proof.value && row.payload.blockers.length) await github('POST', `deployments/${row.id}/statuses`, {
        state: 'pending', description: 'Play predecessors: published', auto_inactive: false });
    }
    states.set(row.id, state);
  }
  return { rows, states, releases, clearedBlockers };
}

export function playSubmissionReadiness(row, { rows, states, releases, clearedBlockers }) {
  const own = states.get(row.id);
  if (['blocked', 'cancelled', 'retired'].includes(own)) return 'blocked';
  const predecessor = row.payload.predecessor;
  if (predecessor !== null) {
    if (!rows.some(item => item.id === predecessor)) throw new Error('Queued predecessor is missing');
    const state = states.get(predecessor);
    if (['blocked', 'cancelled'].includes(state)) return 'blocked';
    if (!['published', 'retired'].includes(state)) return 'waiting';
  }
  for (const blocker of clearedBlockers.has(row.id) ? [] : row.payload.blockers) {
    const result = predecessorResult(blocker, releases);
    if (result !== 'ready') return result;
  }
  return pendingPlayBlockers(releases).length ? 'waiting' : 'ready';
}

function requireSubmissionAttention(row, reason) {
  throw new Error(`Android submission ${row.id}: ${reason}. Preserve the original candidate and checkpoints; ` +
    `inspect https://github.com/campfirium/foliole/actions/runs/${row.payload.runId} before recovery`);
}

export async function resumePendingPlaySubmission({ github, play, candidateId }) {
  // An exact availability check must not resume an unrelated source run.
  if (candidateId) return 'inspection-only';
  const context = await playSubmissionContext(github, play);
  for (const row of context.rows) {
    const state = context.states.get(row.id);
    if (['published', 'retired'].includes(state)) continue;
    if (['blocked', 'cancelled'].includes(state)) requireSubmissionAttention(row, `submission is ${state}`);
    if (state !== 'waiting' && !state.startsWith('resuming:')) return state;
    const run = await github('GET', `actions/runs/${row.payload.runId}`);
    if (state.startsWith('resuming:')) {
      // A lost rerun response must never cause a second dispatch.
      if (run.run_attempt <= Number(state.split(':')[1])) requireSubmissionAttention(row, 'rerun outcome is unknown');
      if (run.status === 'completed') requireSubmissionAttention(row, 'completed rerun needs admission reconciliation');
      return 'resuming';
    }
    if (run.status !== 'completed') return 'waiting';
    if (!['success', 'failure'].includes(run.conclusion)) {
      await writePlaySubmissionState(github, row, 'cancelled');
      requireSubmissionAttention(row, 'source run was cancelled or did not complete normally');
    }
    const ready = playSubmissionReadiness(row, context);
    if (ready === 'blocked') {
      await writePlaySubmissionState(github, row, 'blocked');
      requireSubmissionAttention(row, 'predecessor review was rejected or its submission is blocked');
    }
    if (ready === 'waiting' && context.releases.some(release =>
      release.releaseLifecycleState === 'RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED')) {
      requireSubmissionAttention(row, 'approved beta awaits publication; inspect the complete Console publication scope');
    }
    if (ready !== 'ready') return ready;
    await readReservedPlayHistory(github);
    const evidence = await readPlayQueueEvidence(github, row.payload.runId, row.payload.prebuilt ? PLAY_UPLOAD_ADMISSION_JOB : undefined);
    if (row.payload.prebuilt) await readPrebuiltPlayCandidate(github, row);
    if (evidence.run.head_sha !== row.payload.sourceSha || evidence.version !== row.payload.version ||
        evidence.qualityArtifact.digest !== row.payload.qualityArtifact.digest) throw new Error('Queued quality identity changed');
    await writePlaySubmissionState(github, row, `resuming:${evidence.run.run_attempt}`);
    await github('POST', `actions/jobs/${evidence.jobId}/rerun`, {});
    return 'resuming';
  }
  return 'idle';
}
