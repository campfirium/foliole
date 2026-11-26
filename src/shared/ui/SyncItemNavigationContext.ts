import { createContext } from 'react';

/** Provided by the app shell so a sync page can leave itself and open a library item. */
export const SyncItemNavigationContext = createContext<((nodeId: string) => void) | undefined>(undefined);
