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

  const title = isSyncing ? 'Syncing with desktop' : 'Sync needs attention';
  const detail = workspaceSync.error ?? 'Keeping this device and desktop up to date.';

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
      </div>
    </section>
  );
}
