import { resolvePlayUploadEdit } from './play-upload-edit.mjs';
import { playEditPath } from './play-edit-id.mjs';
import { readPlayReleases } from './play-api.mjs';
import { uploadPlayCandidate, commitPlayCandidate, observePlayCandidate, verifyPlayBundle } from './play-distribution.mjs';
import { verifyStoredMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { readMobileCandidatePhase, writeMobileCandidatePhase } from '../mobile/mobile-candidate-phase.mjs';

export async function deliverRegisteredPlayCandidate({ github, play, registration, loadBundle, notes, saveCheckpoint }) {
  verifyStoredMobileCandidate(registration);
  const state = { ...registration.payload.candidate };
  state.phase = await readMobileCandidatePhase(github, registration.id);
  state.releaseName = `${state.version}.${state.versionCode}.${state.sourceSha.slice(0, 9)}`;
  const save = async candidate => {
    await writeMobileCandidatePhase(github, registration.id, candidate);
    if (saveCheckpoint) await saveCheckpoint(candidate);
  };
  const releases = await readPlayReleases(play);
  const exact = releases.filter(release => release.track === state.track && release.releaseName === state.releaseName &&
    release.activeArtifacts?.some(artifact => Number(artifact.versionCode) === state.versionCode));
  if (exact.length) return observePlayCandidate({ api: play, state, save, inventory: releases });
  if (['commit-unknown', 'committed', 'observed'].includes(state.phase)) {
    throw new Error('Original Play commit is not observable; preserve its durable candidate and never upload again');
  }
  await resolvePlayUploadEdit({ github, play, registration, state });
  if (state.phase === 'upload-unknown') {
    const inventory = await play('GET', `${playEditPath(state.editId)}/bundles`);
    const bundle = inventory.bundles?.find(item => Number(item.versionCode) === state.versionCode);
    if (!bundle) throw new Error('Original upload is absent or uncertain; reconcile manually without uploading again');
    verifyPlayBundle(bundle, state);
    state.phase = 'uploaded'; await save(state);
  }
  if (state.phase === 'signed') {
    await uploadPlayCandidate({ api: play, state, bytes: await loadBundle(), restored: false, save });
  }
  await commitPlayCandidate({ api: play, state, notes, save });
  return observePlayCandidate({ api: play, state, save });
}
