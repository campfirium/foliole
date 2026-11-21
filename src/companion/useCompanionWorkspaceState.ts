import { useCallback, useMemo, useState, useSyncExternalStore, type SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { applyCompanionWorkspacePreview, getCompanionWorkspacePreview, subscribeCompanionWorkspacePreview } from './companionWorkspacePreview';

export function useCompanionWorkspaceState(initial: NativeCompanionWorkspaceSyncState) {
  const [metadata, setMetadata] = useState(initial);
  const published = useSyncExternalStore(companionWorkspaceSnapshots.subscribe, companionWorkspaceSnapshots.getSnapshot);
  // A creation or a move to Trash shows its result before the write commits; the next publication supersedes it.
  const preview = useSyncExternalStore(subscribeCompanionWorkspacePreview, getCompanionWorkspacePreview);
  const native = isAvailableNativeCompanionRuntime();
  const snapshot = useMemo(() => applyCompanionWorkspacePreview(published, preview), [published, preview]);
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
