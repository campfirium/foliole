import { AlertCircle, Loader2 } from 'lucide-react';

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
  const Icon = isSyncing ? Loader2 : AlertCircle;
  const label = isSyncing ? 'Sync in progress' : 'Sync needs attention';

  return (
    <button
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-bg-subtle/60 hover:text-foreground"
      onClick={props.onOpenSyncSettings}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className={`h-5 w-5 ${isSyncing ? 'animate-spin text-accent' : 'text-error'}`}
        strokeWidth={1.8}
      />
    </button>
  );
}
