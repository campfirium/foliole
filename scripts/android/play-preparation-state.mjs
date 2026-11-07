import { listPlaySubmissions } from './play-submission-store.mjs';
import { readMobileStatus } from '../mobile/mobile-candidate-phase.mjs';
import { validPlayEditId } from './play-edit-id.mjs';

const PREFIX = 'Play preparation: ';
export async function readPlayPreparation(github, row) {
  const { value } = await readMobileStatus(github, row.id, PREFIX);
  if (value === undefined) return { phase: 'cleared' };
  const state = JSON.parse(value);
  if (!['creating', 'open', 'cleared'].includes(state.phase) ||
      (state.phase === 'open' && !validPlayEditId(state.editId)) ||
      (state.versionCode !== undefined && (!Number.isSafeInteger(state.versionCode) ||
        state.versionCode < 3 || state.versionCode > 2100000000))) {
    throw new Error('Unknown Play preparation requires reconciliation');
  }
  return state;
}
export async function writePlayPreparation(github, row, state) {
  await github('POST', `deployments/${row.id}/statuses`, { state: 'pending',
    description: `${PREFIX}${JSON.stringify(state)}`, auto_inactive: false });
}

export async function requirePlayReservation(github, candidate) {
  if (candidate.schemaVersion !== 2) return;
  const rows = (await listPlaySubmissions(github)).filter(row => row.payload.prebuilt &&
    row.payload.runId === candidate.runId && row.payload.sourceSha === candidate.sourceSha && row.payload.version === candidate.version);
  if (rows.length !== 1) throw new Error('Exact prebuilt Play reservation is missing');
  const state = await readPlayPreparation(github, rows[0]);
  if (state.phase !== 'cleared' || state.versionCode !== candidate.versionCode) throw new Error('Prebuilt Play reservation differs');
}
