import { Loader2 } from 'lucide-react';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function CompanionSyncInlineStatus(props: {
  workspaceSync: WorkspaceSyncApi;
}) {
  const { workspaceSync } = props;
  const isSyncing = workspaceSync.status === 'syncing';
  if (!isSyncing) {
    return null;
  }

  return (
    <section
      aria-label="Sync status"
      className="mb-2 flex items-center gap-2 px-1 text-xs font-medium leading-5 text-companion-text-secondary"
    >
      <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-accent" strokeWidth={1.8} />
      <span>Syncing topics</span>
    </section>
  );
}
