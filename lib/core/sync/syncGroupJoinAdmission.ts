import { parseSyncGroupJoinRequestInput } from '../../platform/syncGroupJoinContract.js';

import type { DbPort } from './dbPort.js';

// Admission is read-only. Normal member-state checks still protect every later exchange.
export async function assertSyncGroupJoinAdmission(db: DbPort, input: unknown) {
  const request = parseSyncGroupJoinRequestInput(input);
  const [local] = await db.query<{ group_id: string; local_device_identity_key: string }>(
    `SELECT group_id, local_device_identity_key FROM sync_group_local_state
     WHERE singleton_id = 1 AND state = 'active'`
  );
  if (!local || local.group_id !== request.group_id) throw new Error('sync_group_identity_mismatch');
}
