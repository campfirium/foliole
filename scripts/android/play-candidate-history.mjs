import { listMobileCandidates, verifyStoredMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { readPlayVersionHistory } from './play-version-history.mjs';
import { readMobileCandidatePhase } from '../mobile/mobile-candidate-phase.mjs';
import { listPlaySubmissions } from './play-submission-store.mjs';
import { readPlayPreparation } from './play-preparation-state.mjs';
import { readPlaySnapshot } from './play-availability-state.mjs';

export async function readReservedPlayHistory(github, history = readPlayVersionHistory()) {
  const rows = await listMobileCandidates(github);
  const codes = [];
  for (const row of rows) {
    const saved = verifyStoredMobileCandidate(row);
    if (await readPlaySnapshot(github, saved.id) !== 'cleared') {
      throw new Error('An earlier Play availability snapshot remains unresolved; reconcile it before creating another edit');
    }
    if (await readMobileCandidatePhase(github, saved.id) !== 'observed') {
      throw new Error('An earlier Play operation remains unresolved; recover its original run before creating another edit');
    }
    codes.push(saved.payload.candidate.versionCode);
  }
  for (const row of await listPlaySubmissions(github)) {
    const preparation = await readPlayPreparation(github, row);
    if (preparation.phase !== 'cleared') throw new Error('An earlier Play preparation snapshot remains unresolved');
    if (preparation.versionCode) codes.push(preparation.versionCode);
  }
  return { ...history, highestVersionCode: Math.max(history.highestVersionCode, ...codes) };
}
