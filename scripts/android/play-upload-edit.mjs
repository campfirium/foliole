import { readMobileStatus } from '../mobile/mobile-candidate-phase.mjs';
import { requireNoPendingReview, readPlayReleases } from './play-api.mjs';
import { openPlayEdit, validPlayEditId } from './play-edit-id.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { requirePlayReservation } from './play-preparation-state.mjs';

const PREFIX = 'Play upload edit: ';
export async function resolvePlayUploadEdit({ github, play, registration, state }) {
  if (state.schemaVersion === 1) return;
  const { value } = await readMobileStatus(github, registration.id, PREFIX);
  if (value !== undefined && value !== 'creating') {
    if (!openPlayEdit(value)) throw new Error('Unknown durable Play upload edit');
    state.editId = value.slice(5); return;
  }
  if (state.phase !== 'signed') throw new Error('Original upload edit is missing; reconcile without uploading again');
  await requirePlayReservation(github, registration.payload.candidate);
  await readReservedPlayHistory(github, undefined, registration);
  requireNoPendingReview(await readPlayReleases(play));
  const save = description => github('POST', `deployments/${registration.id}/statuses`, {
    state: 'pending', description: `${PREFIX}${description}`, auto_inactive: false });
  await save('creating');
  const edit = await play('POST', 'edits', {});
  if (!validPlayEditId(edit?.id)) throw new Error('Play upload edit creation outcome is unknown');
  await save(`open:${edit.id}`);
  state.editId = edit.id;
}
