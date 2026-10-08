import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { isNodeVersionIdentityOnly } from './syncNodeVersionHistory.js';

export type SyncNodeRecordMetadata = Omit<NativeSyncNodeRecord, 'body_text' | 'alternative_bodies' | 'snapshot'> & {
  snapshot: Omit<NativeSyncNodeRecord['snapshot'], 'content'>;
};

/** The caller keeps the source immutable for the enclosing business transaction. */
export interface SyncNodeRecordSource<M extends SyncNodeRecordMetadata = SyncNodeRecordMetadata> {
  records: readonly M[];
  isIdentityOnly(record: M): boolean;
  load(db: DbPort, record: M): Promise<NativeSyncNodeRecord>;
}

export function arraySyncNodeRecordSource(records: readonly NativeSyncNodeRecord[]): SyncNodeRecordSource<NativeSyncNodeRecord> {
  return { records, isIdentityOnly: isNodeVersionIdentityOnly, load: async (_db, record) => record };
}
