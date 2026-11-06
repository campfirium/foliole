import { allPages } from '../mobile/mobile-candidate-read.mjs';
import { verifyPlaySource } from '../mobile/mobile-candidate-provenance.mjs';
import { readPlayPreparation } from './play-preparation-state.mjs';
import { readPlayQueueEvidence, PLAY_UPLOAD_ADMISSION_JOB } from './play-queue-evidence.mjs';

const BUILD = 'Build and sign the original Android candidate';
const DELIVERY = 'Deliver the durable Android candidate';

function disappeared(blockers, releases) {
  return blockers.length > 0 && blockers.every(blocker => !releases.some(release =>
    release.releaseName === blocker.releaseName || release.activeArtifacts?.some(item =>
      blocker.codes.includes(Number(item.versionCode)))));
}

async function neverAdmitted(github, row) {
  let waiting = false;
  for (let page = 1; ; page += 1) {
    const history = await github('GET', `deployments/${row.id}/statuses?per_page=100&page=${page}`);
    if (!Array.isArray(history)) throw new Error('Play submission operation history is unavailable');
    for (const status of history) {
      const description = status.description ?? '';
      // Historical retirement is neither execution evidence nor a prerequisite.
      if (description === 'Play submission: retired') continue;
      if (description.startsWith('Play submission: ')) {
        if (status.creator?.login !== 'github-actions[bot]' || description !== 'Play submission: waiting') return false;
        waiting = true;
      }
      if (/^Play (?:candidate|upload edit|snapshot): /u.test(description)) return false;
    }
    if (history.length < 100) return waiting;
  }
}

async function unexecuted(github, row) {
  if (!await neverAdmitted(github, row)) return false;
  if ((await readPlayPreparation(github, row)).phase !== 'cleared') return false;
  const base = `actions/runs/${row.payload.runId}`;
  const run = await github('GET', base);
  verifyPlaySource(run);
  if (run.head_sha !== row.payload.sourceSha || run.status !== 'completed' || run.run_attempt < row.payload.attempt) return false;
  const artifacts = await allPages(github, `${base}/artifacts`, 'artifacts');
  if (artifacts.some(item => new RegExp(`^android-play-${row.payload.runId}-`, 'u').test(item.name) ||
    item.name?.startsWith(`release-android-${row.payload.sourceSha}-`))) return false;
  for (let attempt = 1; attempt <= run.run_attempt; attempt += 1) {
    const jobs = await allPages(github, `${base}/attempts/${attempt}/jobs`, 'jobs');
    for (const name of [BUILD, DELIVERY]) {
      const matches = jobs.filter(job => job.name === name || job.name?.endsWith(` / ${name}`));
      if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'skipped') return false;
    }
  }
  const latest = await github('GET', base);
  return latest.head_sha === run.head_sha && latest.run_attempt === run.run_attempt && latest.status === run.status;
}

export async function obsoletePlaySubmissions(github, { rows, releases, candidates }) {
  const obsolete = new Set();
  for (const row of rows) {
    const successor = rows.find(item => item.id > row.id && item.payload.runId !== row.payload.runId &&
      item.payload.sourceSha !== row.payload.sourceSha);
    if (!successor || !disappeared(row.payload.blockers, releases) ||
        candidates.some(item => item.payload.runId === row.payload.runId || item.payload.sourceSha === row.payload.sourceSha)) continue;
    if (!await unexecuted(github, row)) continue;
    const evidence = await readPlayQueueEvidence(github, successor.payload.runId,
      successor.payload.prebuilt ? PLAY_UPLOAD_ADMISSION_JOB : undefined);
    if (evidence.run.head_sha !== successor.payload.sourceSha || evidence.version !== successor.payload.version ||
        evidence.qualityArtifact.digest !== successor.payload.qualityArtifact.digest) throw new Error('Queued quality identity changed');
    obsolete.add(row.id);
  }
  return obsolete;
}
