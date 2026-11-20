import { AlertCircle, RefreshCw } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function CompanionSyncInlineStatus(props: {
  onOpenSyncSettings(): void;
  workspaceSync: WorkspaceSyncApi;
}) {
  const t = useTranslation();
  const { workspaceSync } = props;
  const isSyncing = workspaceSync.status === 'syncing';
  const needsAttention = !isSyncing && Boolean(workspaceSync.error);
  const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(workspaceSync.state);
  if (!isSyncing && !needsAttention && !endpointUrl) {
    return null;
  }
  const label = isSyncing ? t('companion.sync.inline.progress')
    : needsAttention ? t('companion.sync.inline.attention') : t('companion.sync.inline.syncNow');
  const onClick = needsAttention || !endpointUrl ? props.onOpenSyncSettings
    : () => { void workspaceSync.pullFromDesktop(endpointUrl); };

  return (
    <button
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-bg-subtle/60 hover:text-foreground"
      data-testid={isSyncing ? 'companion-sync-inline-progress' : needsAttention ? 'companion-sync-inline-attention' : 'companion-sync-inline-now'}
      disabled={isSyncing}
      onClick={onClick}
      type="button"
    >
      {isSyncing ? (
        <AppSpinner decorative size="sm" />
      ) : needsAttention ? (
        <AlertCircle
          aria-hidden="true"
          className="h-4 w-4 text-error"
          strokeWidth={1.8}
        />
      ) : <RefreshCw aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />}
    </button>
  );
}
