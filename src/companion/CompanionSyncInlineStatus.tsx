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
      className="pointer-events-none fixed left-1/2 top-16 z-30 flex w-full max-w-[760px] -translate-x-1/2 justify-center px-6 sm:px-7"
    >
      <div className="inline-flex items-center gap-2 rounded-md bg-companion-base/90 px-2 py-1 text-sm font-medium leading-6 text-companion-text-secondary shadow-sm backdrop-blur">
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-accent" strokeWidth={1.8} />
        <span>Syncing topics</span>
      </div>
    </section>
  );
}
