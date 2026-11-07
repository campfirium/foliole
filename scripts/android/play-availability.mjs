import { readPlayReleases } from './play-api.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { verifyStoredMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { readMobileCandidatePhase } from '../mobile/mobile-candidate-phase.mjs';
import { readPlaySnapshot, writePlayCheckStatus, writePlayReviewStatus } from './play-availability-state.mjs';
import { playEditPath, validPlayEditId } from './play-edit-id.mjs';

export function exactRelease(releases, candidate) {
  const matches = releases.filter(release => release.track === candidate.track &&
    release.activeArtifacts?.some(item => item.versionCode === candidate.versionCode));
  if (matches.length > 1) throw new Error('Ambiguous Play availability candidate');
  const expectedName = `${candidate.version}.${candidate.versionCode}.${candidate.sourceSha.slice(0, 9)}`;
  if (matches.length && matches[0].releaseName !== expectedName) throw new Error('Play availability release identity differs');
  return matches[0];
}

export function isCompletePlayTrack(track, candidate) {
  if (track?.track !== candidate.track || !Array.isArray(track.releases)) throw new Error('Play track snapshot is unavailable');
  if (track.releases.some(release => !Array.isArray(release.versionCodes) ||
    release.versionCodes.some(code => !/^[1-9]\d*$/u.test(code)))) throw new Error('Play track version inventory is invalid');
  const matches = track.releases.filter(release => release.name ===
    `${candidate.version}.${candidate.versionCode}.${candidate.sourceSha.slice(0, 9)}` &&
    release.versionCodes?.includes(String(candidate.versionCode)));
  if (matches.length > 1) throw new Error('Ambiguous complete Play release');
  const release = matches[0];
  if (!release || release.status !== 'completed' || release.userFraction !== undefined ||
      release.countryTargeting !== undefined || release.versionCodes.length !== 1) return false;
  return !track.releases.some(item => (item.versionCodes ?? []).some(code => Number(code) > candidate.versionCode));
}

async function deleteSnapshot(play, github, row, editId) {
  try { await play('DELETE', playEditPath(editId)); }
  catch (error) { if (error.status !== 404) throw error; }
  await writePlayCheckStatus(github, row, 'snapshot', 'cleared');
}

async function inspectSnapshot(play, github, row) {
  await writePlayCheckStatus(github, row, 'snapshot', 'creating');
  const edit = await play('POST', 'edits', {});
  if (!validPlayEditId(edit?.id)) throw new Error('Play snapshot creation is uncertain; reconcile manually');
  try {
    await writePlayCheckStatus(github, row, 'snapshot', `open:${edit.id}`);
    return isCompletePlayTrack(await play('GET', `${playEditPath(edit.id)}/tracks/${row.payload.candidate.track}`), row.payload.candidate);
  } finally {
    await deleteSnapshot(play, github, row, edit.id);
  }
}

async function checkCandidate(play, github, row) {
  const snapshot = await readPlaySnapshot(github, row.id);
  if (snapshot === 'creating') throw new Error('Play snapshot creation outcome is unknown; reconcile manually without creating another edit');
  if (snapshot.startsWith('open:')) await deleteSnapshot(play, github, row, snapshot.slice(5));
  await readReservedPlayHistory(github);
  const candidate = row.payload.candidate;
  const release = exactRelease(await readPlayReleases(play), candidate);
  if (!release) return 'waiting';
  const state = release.releaseLifecycleState;
  await writePlayReviewStatus(github, row, state);
  if (state === 'RELEASE_LIFECYCLE_STATE_NOT_APPROVED') return 'rejected';
  if (['RELEASE_LIFECYCLE_STATE_IN_REVIEW', 'RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED',
    'RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW', 'RELEASE_LIFECYCLE_STATE_DRAFT'].includes(state)) return 'waiting';
  if (state !== 'RELEASE_LIFECYCLE_STATE_PUBLISHED') throw new Error('Unknown Play publication state');
  if (!await inspectSnapshot(play, github, row)) return 'waiting';
  const refreshed = exactRelease(await readPlayReleases(play), candidate);
  return refreshed?.releaseLifecycleState === 'RELEASE_LIFECYCLE_STATE_PUBLISHED' ? 'available' : 'waiting';
}

export async function checkRegisteredPlayAvailability({ play, github, registration }) {
  const row = verifyStoredMobileCandidate(registration);
  if (await readMobileCandidatePhase(github, row.id) !== 'observed') return 'waiting';
  await writePlayCheckStatus(github, row, 'result', 'checking');
  try {
    const result = await checkCandidate(play, github, row);
    await writePlayCheckStatus(github, row, 'result', result);
    return result;
  } catch (error) {
    await writePlayCheckStatus(github, row, 'result', 'error');
    throw error;
  }
}
