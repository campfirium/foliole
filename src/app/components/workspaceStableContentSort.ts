import { useMemo, useRef } from 'react';

import type { WorkspaceContentSortState } from './workspaceContentSort';

interface StableContentSortSnapshot {
  key: string;
  orderedIds: string[];
}

interface StableWorkspaceContentItemsArgs<T> {
  getItemId: (item: T) => string;
  items: T[];
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
  const snapshotRef = useRef<StableContentSortSnapshot | null>(null);
  const sortControlKey = `${args.sort.key}\u0000${args.sort.direction}`;
  const membershipKey = useMemo(() => args.items.map(args.getItemId).join('\u0000'), [args.getItemId, args.items]);
  const snapshotKey = `${args.scopeKey}\u0000${membershipKey}\u0000${sortControlKey}`;

  return useMemo(() => {
    if (!isDynamicWorkspaceContentSortKey(args.sort)) {
      return args.sortItems(args.items);
    }

    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.key !== snapshotKey) {
      const sortedItems = args.sortItems(args.items);
      snapshotRef.current = {
        key: snapshotKey,
        orderedIds: sortedItems.map(args.getItemId)
      };
      return sortedItems;
    }
    return resolveItemsBySnapshotOrder(args.items, snapshot.orderedIds, args.getItemId);
  }, [args, membershipKey, snapshotKey, sortControlKey]);
}
