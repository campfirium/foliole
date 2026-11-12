import { createHash } from 'node:crypto';
import { validPlayEditId, playEditPath } from './play-edit-id.mjs';
import { readPlayVersionHistory } from './play-version-history.mjs';
import { PLAY_PACKAGE, PLAY_TRACK, readPlayReleases, requireNoPendingReview } from './play-api.mjs';

export function allocatePlayVersion({ bundles, apks, tracks, releases, historyVersionCode }) {
  if (![bundles, apks, tracks, releases].every(Array.isArray)) throw new Error('Incomplete Play version inventory');
  const values = [historyVersionCode, ...[...bundles, ...apks].map(item => item.versionCode)];
  for (const track of tracks) for (const release of track.releases ?? []) values.push(...release.versionCodes ?? []);
  for (const release of releases) values.push(...(release.activeArtifacts ?? []).map(item => item.versionCode));
  const codes = values.map(Number);
  if (!codes.length || codes.some(code => !Number.isSafeInteger(code) || code < 1 || code > 2100000000)) {
    throw new Error('Play version history is empty or invalid');
  }
  const code = Math.max(...codes) + 1;
  if (code > 2100000000) throw new Error('Play version code is exhausted');
  return code;
}

export function verifyPlayCandidate(state, { sourceSha, runId, version }) {
  if (![1, 2].includes(state?.schemaVersion) || !/^[a-f0-9]{40}$/u.test(sourceSha ?? '') ||
      state.sourceSha !== sourceSha || state.acceptedSha !== sourceSha || state.runId !== String(runId) ||
      state.version !== version || state.packageName !== PLAY_PACKAGE || state.track !== PLAY_TRACK ||
      !Number.isSafeInteger(state.versionCode) || state.versionCode <= 2 || state.versionCode > 2100000000 ||
      (state.schemaVersion === 1 ? !validPlayEditId(state.editId) : (state.editId !== undefined && !validPlayEditId(state.editId)))) throw new Error('Saved Play candidate identity differs');
  return state;
}

export async function preparePlayCandidate(api, identity, history = readPlayVersionHistory()) {
  const releases = await readPlayReleases(api);
  requireNoPendingReview(releases);
  const edit = await api('POST', 'edits', {});
  if (!validPlayEditId(edit.id)) throw new Error('Play returned no edit identity');
  const base = playEditPath(edit.id);
  const [bundles, apks, tracks] = await Promise.all([
    api('GET', `${base}/bundles`), api('GET', `${base}/apks`), api('GET', `${base}/tracks`)
  ]);
  if (!tracks.tracks?.some(track => track.track === PLAY_TRACK)) throw new Error('Existing beta track was not found');
  const versionCode = allocatePlayVersion({ bundles: bundles.bundles ?? [], apks: apks.apks ?? [],
    tracks: tracks.tracks, releases, historyVersionCode: history.highestVersionCode });
  const state = { schemaVersion: 1, ...identity, packageName: PLAY_PACKAGE, track: PLAY_TRACK,
    editId: edit.id, expiryTimeSeconds: edit.expiryTimeSeconds, versionCode, historyVersionCode: history.highestVersionCode, phase: 'prepared' };
  return verifyPlayCandidate(state, identity);
}

export function verifyPlayBundle(bundle, state) {
  if (Number(bundle?.versionCode) !== state.versionCode || bundle.sha256?.toLowerCase() !== state.aabSha256) {
    throw new Error('Play bundle identity or SHA256 differs; do not replace or re-upload');
  }
}

export async function uploadPlayCandidate({ api, state, bytes, restored = false, save }) {
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== state.aabSha256 || !/^[a-f0-9]{64}$/u.test(digest)) throw new Error('Signed candidate changed');
  const base = playEditPath(state.editId);
  const inventory = await api('GET', `${base}/bundles`);
  const existing = inventory.bundles?.find(bundle => Number(bundle.versionCode) === state.versionCode);
  if (existing) verifyPlayBundle(existing, state);
  else {
    if (restored) throw new Error('Prior upload is absent or uncertain; manual reconciliation is required, no automatic retry');
    requireNoPendingReview(await readPlayReleases(api));
    state.phase = 'upload-unknown'; await save(state);
    const bundle = await api('POST', `${base}/bundles?uploadType=media`, bytes, true);
    verifyPlayBundle(bundle, state);
  }
  state.phase = 'uploaded'; await save(state);
  return state;
}

export async function commitPlayCandidate({ api, state, notes, save }) {
  if (state.phase !== 'uploaded') throw new Error('A confirmed upload is required');
  if (typeof notes !== 'string' || !notes.trim() || notes.length > 500) throw new Error('English release notes are required (maximum 500 characters)');
  requireNoPendingReview(await readPlayReleases(api));
  const base = playEditPath(state.editId);
  const inventory = await api('GET', `${base}/bundles`);
  verifyPlayBundle(inventory.bundles?.find(bundle => Number(bundle.versionCode) === state.versionCode), state);
  const track = await api('GET', `${base}/tracks/${PLAY_TRACK}`);
  if (track.track !== PLAY_TRACK || track.releases?.some(release => ['draft', 'inProgress'].includes(release.status))) {
    throw new Error('Existing beta release needs attention; do not replace it');
  }
  const releaseName = `${state.version}.${state.versionCode}.${state.sourceSha.slice(0, 9)}`;
  await api('PUT', `${base}/tracks/${PLAY_TRACK}`, { track: PLAY_TRACK,
    releases: [{ name: releaseName, versionCodes: [String(state.versionCode)], status: 'completed',
      releaseNotes: [{ language: 'en-US', text: notes.trim() }] }] });
  await api('POST', `${base}:validate`);
  state.phase = 'commit-unknown'; state.releaseName = releaseName; await save(state);
  await api('POST', `${base}:commit?changesNotSentForReview=false&changesInReviewBehavior=ERROR_IF_IN_REVIEW`);
  state.phase = 'committed'; await save(state);
  return state;
}

export async function observePlayCandidate({ api, state, save, inventory }) {
  const releases = inventory ?? await readPlayReleases(api);
  const matches = releases.filter(release => release.track === PLAY_TRACK &&
    release.releaseName === state.releaseName && release.activeArtifacts?.some(item => Number(item.versionCode) === state.versionCode));
  if (matches.length !== 1) throw new Error('Exact Play release is not observable yet; preserve the original run');
  state.releaseLifecycleState = matches[0].releaseLifecycleState;
  state.phase = 'observed'; await save(state);
  const accepted = ['IN_REVIEW', 'APPROVED_NOT_PUBLISHED', 'PUBLISHED'].map(value => `RELEASE_LIFECYCLE_STATE_${value}`);
  if (!accepted.includes(state.releaseLifecycleState)) throw new Error('Play has not confirmed submission or approval; inspect the recorded lifecycle state');
  return state;
}
