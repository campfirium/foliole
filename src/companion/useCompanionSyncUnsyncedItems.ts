import { useEffect, useState } from 'react';

import type { SyncUnsyncedViewItem } from '../../lib/core/sync/syncUnsyncedView';
import { loadCompanionSyncUnsyncedItems } from '../shared/platform/companion/sync/companionSyncUnsyncedItems';

/** Reloads when a sync run adds activity; the record changes only during sync. */
export function useCompanionSyncUnsyncedItems(syncEvents: unknown) {
  const [items, setItems] = useState<SyncUnsyncedViewItem[]>([]);
  useEffect(() => {
    let disposed = false;
    void loadCompanionSyncUnsyncedItems().then(next => { if (!disposed) setItems(next); }, () => undefined);
    return () => { disposed = true; };
  }, [syncEvents]);
  return items;
}
