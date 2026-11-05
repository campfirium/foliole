import { listMobileCandidates, verifyStoredMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { readPlayVersionHistory } from './play-version-history.mjs';
import { readMobileCandidatePhase } from '../mobile/mobile-candidate-phase.mjs';

export async function readReservedPlayHistory(github, history = readPlayVersionHistory()) {
  const rows = await listMobileCandidates(github);
  const codes = [];
  for (const row of rows) {
    const saved = verifyStoredMobileCandidate(row);
    if (await readMobileCandidatePhase(github, saved.id) !== 'observed') {
      throw new Error('An earlier Play operation remains unresolved; recover its original run before creating another edit');
    }
    codes.push(saved.payload.candidate.versionCode);
  }
  return { ...history, highestVersionCode: Math.max(history.highestVersionCode, ...codes) };
}
