import { PLAY_PACKAGE, PLAY_TRACK } from '../android/play-api.mjs';
import { readPlayPublicStatus, wasPlayPubliclyAvailable } from '../android/play-availability-state.mjs';
import { readMobileCandidatePhase } from './mobile-candidate-phase.mjs';
import { listMobileCandidates, verifyStoredMobileCandidate } from './mobile-candidate-store.mjs';

const url = `https://play.google.com/apps/testing/${PLAY_PACKAGE}`;

async function readCandidate(github, row) {
  const { candidate, lane } = verifyStoredMobileCandidate(row).payload;
  if (candidate.track !== PLAY_TRACK || candidate.packageName !== PLAY_PACKAGE ||
    !['committed', 'observed'].includes(await readMobileCandidatePhase(github, row.id))) return;
  const status = await readPlayPublicStatus(github, row.id) ?? 'verifying';
  const wasAvailable = status === 'available' || await wasPlayPubliclyAvailable(github, row.id);
  return { wasAvailable, review: { version: candidate.version, build: String(candidate.versionCode), status,
    ...(status === 'available' ? { url } : {}), releaseSourceSha: candidate.sourceSha, releaseLane: lane } };
}

export async function readPlayPublicDownloads(github) {
  const rows = await listMobileCandidates(github);
  const entries = (await Promise.all(rows.map(row => readCandidate(github, row))))
    .filter(Boolean).sort((left, right) => Number(right.review.build) - Number(left.review.build));
  const current = entries.findIndex(entry => entry.wasAvailable);
  return entries.slice(0, current < 0 ? undefined : current + 1).map(entry => entry.review);
}
