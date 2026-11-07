import { listMobileCandidates, verifyStoredMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { readPlayVersionHistory } from './play-version-history.mjs';
import { readMobileCandidatePhase, readMobileStatus } from '../mobile/mobile-candidate-phase.mjs';
import { isDeepStrictEqual } from 'node:util';
import { listPlaySubmissions } from './play-submission-store.mjs';
import { readPlayPreparation } from './play-preparation-state.mjs';
import { readPlaySnapshot } from './play-availability-state.mjs';

async function unusedSignedCandidate(github, saved, phase) {
  if (phase !== 'signed' || saved.payload.candidate.schemaVersion !== 2 || saved.payload.candidate.phase !== 'signed') return false;
  return (await readMobileStatus(github, saved.id, 'Play upload edit: ')).value === undefined;
}

export async function readReservedPlayHistory(github, history = readPlayVersionHistory(), signedCandidate, rejectedPreparationId) {
  const rows = await listMobileCandidates(github);
  const codes = [];
  let foundSigned = false;
  for (const row of rows) {
    const saved = verifyStoredMobileCandidate(row);
    if (await readPlaySnapshot(github, saved.id) !== 'cleared') {
      throw new Error('An earlier Play availability snapshot remains unresolved; reconcile it before creating another edit');
    }
    const phase = await readMobileCandidatePhase(github, saved.id);
    if (saved.id === signedCandidate?.id) {
      const prior = await readMobileStatus(github, saved.id, 'Play candidate: ');
      if (foundSigned || phase !== 'signed' || prior.value !== undefined ||
          saved.payload.candidate.schemaVersion !== 2 || saved.payload.candidate.phase !== 'signed' ||
          !isDeepStrictEqual(saved.payload, signedCandidate.payload)) throw new Error('Original signed Play candidate differs or has upload history');
      foundSigned = true;
    } else if (phase !== 'observed' && !(signedCandidate && await unusedSignedCandidate(github, saved, phase))) {
      throw new Error('An earlier Play operation remains unresolved; recover its original run before creating another edit');
    }
    codes.push(saved.payload.candidate.versionCode);
  }
  if (signedCandidate && !foundSigned) throw new Error('Original signed Play candidate is missing');
  for (const row of await listPlaySubmissions(github)) {
    const preparation = await readPlayPreparation(github, row);
    if (row.id === rejectedPreparationId && preparation.phase === 'creating' && !preparation.versionCode) continue;
    if (preparation.phase !== 'cleared') throw new Error('An earlier Play preparation snapshot remains unresolved');
    if (preparation.versionCode) codes.push(preparation.versionCode);
  }
  return { ...history, highestVersionCode: Math.max(history.highestVersionCode, ...codes) };
}
