import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { applyParentOrderFactObject } from './syncParentOrderFactApply.js';

/** A receipt acknowledges identity, while an immutable body may later need materializing again. */
export async function replayRetiredParentOrderBodies(db: DbPort,
  records: readonly NativeSyncObjectRecord[]) {
  for (const record of records) {
    if (record.object_type !== 'order_version') continue;
    const [version] = await db.query<{ child_ids_json: string }>(
      'SELECT child_ids_json FROM parent_order_versions WHERE version_id = ?', [record.object_id]);
    if (version?.child_ids_json === 'null') await applyParentOrderFactObject(db, record);
  }
}
