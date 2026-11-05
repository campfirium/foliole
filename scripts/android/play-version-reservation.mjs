import { listMobileCandidates } from '../mobile/mobile-candidate-store.mjs';
import { listPlaySubmissions, readPlaySubmissionState } from './play-submission-store.mjs';
import { allocatePlayVersion } from './play-distribution.mjs';
import { readPlayReleases, PLAY_TRACK } from './play-api.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { readPlayPreparation, writePlayPreparation } from './play-preparation-state.mjs';

async function clearSnapshot(github, play, row, state) {
  try { await play('DELETE', `edits/${state.editId}`); }
  catch (error) { if (error.status !== 404) throw error; }
  const cleared = { phase: 'cleared', ...(state.versionCode ? { versionCode: state.versionCode } : {}) };
  await writePlayPreparation(github, row, cleared);
  return cleared;
}

export async function reservePlayVersion({ github, play, row }) {
  let state = await readPlayPreparation(github, row);
  if (state.phase === 'creating') throw new Error('Play inventory snapshot outcome is unknown; reconcile before preparing another bundle');
  if (state.phase === 'open') state = await clearSnapshot(github, play, row, state);
  if (state.versionCode) return state.versionCode;
  const history = await readReservedPlayHistory(github);
  const earlier = (await listPlaySubmissions(github)).filter(item => item.id < row.id && !item.payload.prebuilt);
  const candidates = earlier.length ? await listMobileCandidates(github) : [];
  for (const item of earlier) {
    const status = await readPlaySubmissionState(github, item);
    if (!['published', 'retired'].includes(status) && !candidates.some(candidate =>
      candidate.payload.runId === item.payload.runId && candidate.payload.sourceSha === item.payload.sourceSha)) {
      throw new Error('Earlier legacy submission has no fixed version; finish its original run before preparing later sources');
    }
  }
  const releases = await readPlayReleases(play);
  await writePlayPreparation(github, row, { phase: 'creating' });
  const edit = await play('POST', 'edits', {});
  if (!/^[1-9]\d*$/u.test(edit?.id ?? '')) throw new Error('Play inventory snapshot outcome is unknown');
  state = { phase: 'open', editId: edit.id };
  try {
    await writePlayPreparation(github, row, state);
    const base = `edits/${edit.id}`;
    const [bundles, apks, tracks] = await Promise.all([
      play('GET', `${base}/bundles`), play('GET', `${base}/apks`), play('GET', `${base}/tracks`)
    ]);
    if (!tracks.tracks?.some(track => track.track === PLAY_TRACK)) throw new Error('Existing beta track was not found');
    state.versionCode = allocatePlayVersion({ bundles: bundles.bundles ?? [], apks: apks.apks ?? [],
      tracks: tracks.tracks, releases, historyVersionCode: history.highestVersionCode });
    await writePlayPreparation(github, row, state);
  } finally { await clearSnapshot(github, play, row, state); }
  return state.versionCode;
}
