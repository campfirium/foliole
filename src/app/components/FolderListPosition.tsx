import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { readRuntimeLibraryPathSettingsCache } from '../../shared/platform/libraryPathSettingsCache';
import type { VirtualListAnchor, VirtualListPosition } from '../../shared/ui/virtualListPosition';

const PositionsContext = createContext<Map<string, VirtualListAnchor> | null>(null);
const FolderContext = createContext<string | null>(null);

export function FolderListPositionProvider({ children }: { children: ReactNode }) {
  const library = readRuntimeLibraryPathSettingsCache()?.databasePath ?? null;
  const positions = useMemo(() => library ? new Map<string, VirtualListAnchor>() : null, [library]);
  return <PositionsContext.Provider value={positions}>{children}</PositionsContext.Provider>;
}

export function FolderListPositionScope({ children, folderId }: { children: ReactNode; folderId: string }) {
  return <FolderContext.Provider value={folderId}>{children}</FolderContext.Provider>;
}

export function useFolderListPosition(query: string): VirtualListPosition | undefined {
  const positions = useContext(PositionsContext);
  const folderId = useContext(FolderContext);
  const identity = JSON.stringify([folderId, query]);
  return useMemo(() => positions && folderId ? {
    read: () => positions.get(identity),
    write: (anchor: VirtualListAnchor) => {
      positions.delete(identity);
      positions.set(identity, anchor);
      if (positions.size > 20) positions.delete(positions.keys().next().value!);
    }
  } : undefined, [folderId, identity, positions]);
}
