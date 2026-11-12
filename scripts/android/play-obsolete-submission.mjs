import { allPages } from '../mobile/mobile-candidate-read.mjs';
import { verifyPlaySource, verifyPlaySourceIdentity } from '../mobile/mobile-candidate-provenance.mjs';
import { readPlayPreparation } from './play-preparation-state.mjs';
import { readPlayQueueEvidence, PLAY_UPLOAD_ADMISSION_JOB } from './play-queue-evidence.mjs';

const BUILD = 'Build and sign the original Android candidate';
const DELIVERY = 'Deliver the durable Android candidate';

function disappeared(blockers, releases) {
  return blockers.length > 0 && blockers.every(blocker => !releases.some(release =>
    release.releaseName === blocker.releaseName || release.activeArtifacts?.some(item =>
      blocker.codes.includes(Number(item.versionCode)))));
}

async function neverAdmitted(github, row, cancelled) {
  let waiting = false;
  for (let page = 1; ; page += 1) {
    const history = await github('GET', `deployments/${row.id}/statuses?per_page=100&page=${page}`);
    if (!Array.isArray(history)) throw new Error('Play submission operation history is unavailable');
    for (const status of history) {
      const description = status.description ?? '';
      // Historical retirement is neither execution evidence nor a prerequisite.
      if (description === 'Play submission: retired') continue;
      if (description.startsWith('Play submission: ')) {
        if (status.creator?.login !== 'github-actions[bot]') return false;
        if (cancelled && description === 'Play submission: cancelled' && !waiting) continue;
        if (description !== 'Play submission: waiting') return false;
        waiting = true;
      }
      if (/^Play (?:candidate|upload edit|snapshot): /u.test(description)) return false;
    }
    if (history.length < 100) return waiting;
  }
}

function jobNeverStarted(job, cancelled) {
  if (job.status !== 'completed') return false;
  if (!cancelled) return job.conclusion === 'skipped';
  return ['cancelled', 'skipped'].includes(job.conclusion) && job.runner_id === null &&
    Array.isArray(job.steps) && job.steps.length === 0;
}

async function unexecuted(github, row, cancelled) {
  if (!await neverAdmitted(github, row, cancelled)) return false;
  const preparation = await readPlayPreparation(github, row);
  if (preparation.phase !== 'cleared' || (cancelled && preparation.versionCode === undefined)) return false;
  const base = `actions/runs/${row.payload.runId}`;
  const run = await github('GET', base);
  if (cancelled && run.conclusion !== 'cancelled') return false;
  if (cancelled) verifyPlaySourceIdentity(run);
  else verifyPlaySource(run);
  if (String(run.id) !== row.payload.runId || run.head_sha !== row.payload.sourceSha ||
      run.status !== 'completed' || run.run_attempt < row.payload.attempt) return false;
  const artifacts = await allPages(github, `${base}/artifacts`, 'artifacts');
  if (artifacts.some(item => new RegExp(`^android-play-${row.payload.runId}-`, 'u').test(item.name) ||
    item.name?.startsWith(`release-android-${row.payload.sourceSha}-`))) return false;
  const names = cancelled ? [BUILD, PLAY_UPLOAD_ADMISSION_JOB, DELIVERY] : [BUILD, DELIVERY];
  for (let attempt = 1; attempt <= run.run_attempt; attempt += 1) {
    const jobs = await allPages(github, `${base}/attempts/${attempt}/jobs`, 'jobs');
    for (const name of names) {
      const matches = jobs.filter(job => job.name === name || job.name?.endsWith(` / ${name}`));
      if (matches.length !== 1 || !jobNeverStarted(matches[0], cancelled)) return false;
    }
  }
  const latest = await github('GET', base);
  return latest.head_sha === run.head_sha && latest.run_attempt === run.run_attempt &&
    latest.status === run.status && latest.conclusion === run.conclusion;
}

function hasDurableSuccessor(candidates, { payload }) {
  const quality = payload.qualityArtifact;
  return candidates.some(({ payload: saved }) => saved.runId === payload.runId &&
    saved.sourceSha === payload.sourceSha && saved.candidate.version === payload.version &&
    saved.qualityArtifact.id === quality.id && saved.qualityArtifact.name === quality.name &&
    saved.qualityArtifact.digest === quality.digest);
}

export async function obsoletePlaySubmissions(github, { rows, releases, candidates }) {
  const obsolete = new Map();
  for (const row of rows) {
    const cancelled = row.payload.prebuilt === true && row.payload.blockers.length === 0;
    const laterSource = item => item.id > row.id && item.payload.runId !== row.payload.runId &&
      item.payload.sourceSha !== row.payload.sourceSha;
    const successor = cancelled ? rows.findLast(laterSource) : rows.find(laterSource);
    if (!successor || (!cancelled && !disappeared(row.payload.blockers, releases)) ||
        candidates.some(item => item.payload.runId === row.payload.runId || item.payload.sourceSha === row.payload.sourceSha)) continue;
    if (!await unexecuted(github, row, cancelled)) continue;
    if (!cancelled || !hasDurableSuccessor(candidates, successor)) {
      const evidence = await readPlayQueueEvidence(github, successor.payload.runId,
        successor.payload.prebuilt ? PLAY_UPLOAD_ADMISSION_JOB : undefined);
      if (evidence.run.head_sha !== successor.payload.sourceSha || evidence.version !== successor.payload.version ||
          evidence.qualityArtifact.digest !== successor.payload.qualityArtifact.digest) throw new Error('Queued quality identity changed');
    }
    // Preserve the cancelled row's own predecessor when skipping its empty turn.
    obsolete.set(row.id, cancelled ? row.payload.predecessor : null);
  }
  return obsolete;
}
