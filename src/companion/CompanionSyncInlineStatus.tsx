import { Loader2 } from 'lucide-react';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function CompanionSyncInlineStatus(props: {
  workspaceSync: WorkspaceSyncApi;
}) {
  const { workspaceSync } = props;
  const isSyncing = workspaceSync.status === 'syncing';
  if (!isSyncing && !workspaceSync.error) {
    return null;
  }
  const title = isSyncing ? 'Syncing topics' : 'Sync needs attention';
  const detail = workspaceSync.error ?? 'Bringing the latest desktop content onto this device.';

  return (
    <section
      aria-label="Sync status"
      className="mb-4 rounded-2xl border border-companion-divider bg-canvas px-4 py-3 text-sm shadow-panel"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {isSyncing ? <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin text-accent" strokeWidth={1.8} /> : null}
          <div className="min-w-0">
            <p className="font-medium text-foreground">{title}</p>
            <p className="mt-1 leading-5 text-companion-text-secondary">{detail}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
