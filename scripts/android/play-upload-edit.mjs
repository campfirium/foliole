import { readMobileStatus } from '../mobile/mobile-candidate-phase.mjs';
import { requireNoPendingReview, readPlayReleases } from './play-api.mjs';

const PREFIX = 'Play upload edit: ';
export async function resolvePlayUploadEdit({ github, play, registration, state }) {
  if (state.schemaVersion === 1) return;
  const { value } = await readMobileStatus(github, registration.id, PREFIX);
  if (value === 'creating') throw new Error('Play upload edit creation outcome is unknown; reconcile without creating another edit');
  if (value !== undefined) {
    if (!/^open:[1-9]\d*$/u.test(value)) throw new Error('Unknown durable Play upload edit');
    state.editId = value.slice(5); return;
  }
  if (state.phase !== 'signed') throw new Error('Original upload edit is missing; reconcile without uploading again');
  requireNoPendingReview(await readPlayReleases(play));
  const save = description => github('POST', `deployments/${registration.id}/statuses`, {
    state: 'pending', description: `${PREFIX}${description}`, auto_inactive: false });
  await save('creating');
  const edit = await play('POST', 'edits', {});
  if (!/^[1-9]\d*$/u.test(edit?.id ?? '')) throw new Error('Play upload edit creation outcome is unknown');
  await save(`open:${edit.id}`);
  state.editId = edit.id;
}
