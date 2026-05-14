import { AlertCircle } from 'lucide-react';

import { AppSpinner } from '../shared/ui';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function CompanionSyncInlineStatus(props: {
  onOpenSyncSettings(): void;
  workspaceSync: WorkspaceSyncApi;
}) {
  const { workspaceSync } = props;
  const isSyncing = workspaceSync.status === 'syncing';
  const needsAttention = !isSyncing && Boolean(workspaceSync.error);
  if (!isSyncing && !needsAttention) {
    return null;
  }
  const label = isSyncing ? 'Sync in progress' : 'Sync needs attention';

  return (
    <button
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-bg-subtle/60 hover:text-foreground"
      onClick={props.onOpenSyncSettings}
      type="button"
    >
      {isSyncing ? (
        <AppSpinner decorative />
      ) : (
        <AlertCircle
          aria-hidden="true"
          className="h-5 w-5 text-error"
          strokeWidth={1.8}
        />
      )}
    </button>
  );
}
