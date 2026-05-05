import { useEffect, useState } from 'react';

import { loadCompanionPendingSyncSummary } from '../shared/platform/companionSyncObjects';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

function buildPendingLabel(pendingCount: number) {
  return pendingCount === 1 ? '1 change waiting to sync.' : `${pendingCount} changes waiting to sync.`;
}

function usePendingSyncCount(workspaceSync: WorkspaceSyncApi) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadCompanionPendingSyncSummary()
      .then((summary) => {
        if (!cancelled) setPendingCount(summary.pendingCount);
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSync.state, workspaceSync.status]);

  return pendingCount;
}

export function CompanionSyncInlineStatus(props: {
  workspaceSync: WorkspaceSyncApi;
}) {
  const { workspaceSync } = props;
  const pendingCount = usePendingSyncCount(workspaceSync);
  const endpointUrl = workspaceSync.state.endpoint_url;
  const isSyncing = workspaceSync.status === 'syncing';

  if (!isSyncing && !workspaceSync.error && pendingCount <= 0) {
    return null;
  }

  const title = isSyncing ? 'Syncing with desktop' : workspaceSync.error ? 'Sync needs attention' : 'Pending sync';
  const detail = workspaceSync.error ?? (isSyncing ? 'Keeping this device and desktop up to date.' : buildPendingLabel(pendingCount));

  return (
    <section
      aria-label="Sync status"
      className="mb-4 rounded-2xl border border-companion-divider bg-canvas px-4 py-3 text-sm shadow-panel"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-1 leading-5 text-companion-text-secondary">{detail}</p>
        </div>
        {endpointUrl && !isSyncing ? (
          <button
            className="shrink-0 rounded-full border border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-canvas"
            onClick={() => void workspaceSync.pullFromDesktop(endpointUrl).catch(() => undefined)}
            type="button"
          >
            Sync now
          </button>
        ) : null}
      </div>
    </section>
  );
}
