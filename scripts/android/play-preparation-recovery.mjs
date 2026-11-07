import { isDeepStrictEqual } from 'node:util';

import { readMobileStatus } from '../mobile/mobile-candidate-phase.mjs';
import { readPlayReleases } from './play-api.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { playEditPath, validPlayEditId } from './play-edit-id.mjs';
import { readPlayPreparation, writePlayPreparation } from './play-preparation-state.mjs';

// This failed job accepted a valid Google response, then rejected its opaque ID before any write to the edit.
const APPROVED = { id: 7617424538, runId: '42342661860', jobId: 128322141561, attempt: 1, version: '0.8.1',
  sourceSha: '2bc09f0065e54a3bcbba3ed5e067307ac1abe350' };
const RECOVERY = 'Play preparation recovery: ';

function matchesApprovedAttempt(row, env, approval) {
  const candidate = row.payload;
  return candidate.prebuilt === true && candidate.jobId === approval.jobId && candidate.attempt === approval.attempt &&
    candidate.runId === approval.runId && candidate.sourceSha === approval.sourceSha && candidate.version === approval.version &&
    env.GITHUB_RUN_ID === approval.runId && env.GITHUB_SHA === approval.sourceSha &&
    env.GITHUB_RUN_ATTEMPT === String(approval.attempt + 1);
}

async function markRecovery(github, row, phase) {
  await github('POST', `deployments/${row.id}/statuses`, { state: 'pending',
    description: `${RECOVERY}${phase}`, auto_inactive: false });
}

export async function recoverRejectedPlaySnapshot({ github, play, row, env, approval = APPROVED }) {
  if (row.id !== approval.id) return false;
  const state = await readPlayPreparation(github, row);
  if (state.phase === 'cleared') return false;
  if (!matchesApprovedAttempt(row, env, approval) || state.phase !== 'creating' || state.versionCode ||
      (await readMobileStatus(github, row.id, RECOVERY)).value !== undefined) {
    throw new Error('The approved Play snapshot recovery cannot be repeated or applied to another attempt');
  }
  await readReservedPlayHistory(github, undefined, undefined, row.id);
  const before = await readPlayReleases(play);
  await markRecovery(github, row, 'started');
  // The same dedicated account can have only one edit; this invalidates the known empty edit.
  const edit = await play('POST', 'edits', {});
  if (!validPlayEditId(edit?.id)) throw new Error('Replacement Play snapshot identity is unknown');
  try { await writePlayPreparation(github, row, { phase: 'open', editId: edit.id }); }
  finally { await play('DELETE', playEditPath(edit.id)); }
  if (!isDeepStrictEqual(await readPlayReleases(play), before)) {
    throw new Error('Play release inventory changed during snapshot recovery');
  }
  await markRecovery(github, row, 'verified release inventory unchanged');
  await writePlayPreparation(github, row, { phase: 'cleared' });
  return true;
}
