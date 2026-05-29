import { useMemo, useRef } from 'react';

import type { WorkspaceContentSortState } from './workspaceContentSort';

interface StableContentSortSnapshot {
  key: string;
  orderedIds: string[];
}

interface StableWorkspaceContentItemsArgs<T> {
  getItemId: (item: T) => string;
  items: T[];
  refreshKey?: string | number;
  scopeKey: string;
  sort: WorkspaceContentSortState;
  sortItems: (items: T[]) => T[];
}

function isDynamicWorkspaceContentSortKey(sort: WorkspaceContentSortState) {
  return sort.key === 'lastOpenedAt' || sort.key === 'modifiedAt' || sort.key === 'savedAt';
}

function resolveItemsBySnapshotOrder<T>(items: T[], orderedIds: string[], getItemId: (item: T) => string) {
  const itemsById = new Map(items.map((item) => [getItemId(item), item]));
  return orderedIds.map((itemId) => itemsById.get(itemId)).filter((item): item is T => Boolean(item));
}

export function useStableWorkspaceContentItems<T>(args: StableWorkspaceContentItemsArgs<T>) {
  const { getItemId, items, refreshKey, scopeKey, sort, sortItems } = args;
  const snapshotRef = useRef<StableContentSortSnapshot | null>(null);
  const sortControlKey = `${sort.key}\u0000${sort.direction}`;
  const membershipKey = useMemo(() => items.map(getItemId).join('\u0000'), [getItemId, items]);
  const snapshotKey = `${scopeKey}\u0000${refreshKey ?? ''}\u0000${membershipKey}\u0000${sortControlKey}`;

  return useMemo(() => {
    if (!isDynamicWorkspaceContentSortKey(sort)) {
      return sortItems(items);
    }

    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.key !== snapshotKey) {
      const sortedItems = sortItems(items);
      snapshotRef.current = {
        key: snapshotKey,
        orderedIds: sortedItems.map(getItemId)
      };
      return sortedItems;
    }
    return resolveItemsBySnapshotOrder(items, snapshot.orderedIds, getItemId);
  }, [getItemId, items, membershipKey, snapshotKey, sort, sortControlKey, sortItems]);
}
