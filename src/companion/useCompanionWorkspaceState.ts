import { useCallback, useMemo, useState, useSyncExternalStore, type SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { applyCompanionTrashPreview, getCompanionTrashPreview, subscribeCompanionTrashPreview } from './companionTrashPreview';

export function useCompanionWorkspaceState(initial: NativeCompanionWorkspaceSyncState) {
  const [metadata, setMetadata] = useState(initial);
  const published = useSyncExternalStore(companionWorkspaceSnapshots.subscribe, companionWorkspaceSnapshots.getSnapshot);
  // A move to Trash shows its result before the write commits; the next publication supersedes it.
  const trashPreview = useSyncExternalStore(subscribeCompanionTrashPreview, getCompanionTrashPreview);
  const native = isAvailableNativeCompanionRuntime();
  const snapshot = useMemo(() => applyCompanionTrashPreview(published, trashPreview), [published, trashPreview]);
  const state = useMemo(() => native ? { ...metadata, workspace_snapshot: snapshot } : metadata,
    [metadata, native, snapshot]);
  const setState = useCallback((update: SetStateAction<NativeCompanionWorkspaceSyncState>) => {
    setMetadata(current => {
      const base = native ? { ...current, workspace_snapshot: companionWorkspaceSnapshots.getSnapshot() } : current;
      const next = typeof update === 'function' ? update(base) : update;
      // Native snapshot publication belongs exclusively to the external store.
      return native ? { ...next, workspace_snapshot: current.workspace_snapshot } : next;
    });
  }, [native]);
  return [state, setState] as const;
}
