import { useEffect } from 'react';

import { onManagedInboxUpdated } from '../../shared/platform/runtimeShellEvents';

import { applyImportWorkspacePatch } from './formalImportWorkspacePatch';

export function useManagedInboxUpdateSubscription(
  isAvailable: boolean,
  refreshManagedInboxOverview: (importId?: string) => Promise<void>
) {
  useEffect(() => {
    if (!isAvailable) {
      return;
    }
    let isDisposed = false;
    let unlisten: (() => void) | null = null;
    void onManagedInboxUpdated((payload) => {
      if (isDisposed) {
        return;
      }
      applyImportWorkspacePatch(payload.importId, payload.nodeMutationPatch);
      void refreshManagedInboxOverview(payload.importId);
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten?.();
        return;
      }
      unlisten = nextUnlisten;
    });
    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [isAvailable, refreshManagedInboxOverview]);
}

export function useManagedInboxFocusRefresh(
  isAvailable: boolean,
  refreshManagedInboxOverview: () => Promise<void>
) {
  useEffect(() => {
    if (!isAvailable || typeof window === 'undefined') {
      return;
    }

    const handleFocus = () => {
      void refreshManagedInboxOverview();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAvailable, refreshManagedInboxOverview]);
}
