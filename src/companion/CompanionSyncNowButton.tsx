import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

import type { CompanionManualSyncAction } from './companionManualSyncAction';

export function CompanionSyncNowButton(props: {
  failureDetail?: string;
  isSyncing: boolean;
  manualSyncAction?: CompanionManualSyncAction | null;
  onSync(): void;
}) {
  const t = useTranslation();
  const actionRunning = props.manualSyncAction?.status !== 'terminal'
    && Boolean(props.manualSyncAction);
  const busy = props.isSyncing || actionRunning;
  const terminal = props.manualSyncAction?.status === 'terminal'
    ? props.manualSyncAction : null;
  const label = t(busy ? 'companion.browse.syncing' : 'companion.sync.action.syncNow');
  return (
    <div className="flex flex-col gap-3">
      <button
        aria-busy={busy || undefined}
        className="inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-border-strong bg-foreground px-4 py-2.5 text-sm font-semibold text-bg-panel transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent disabled:cursor-not-allowed disabled:opacity-55"
        data-sync-action-run-id={props.manualSyncAction?.runId}
        data-sync-action-started={props.manualSyncAction?.started}
        data-sync-action-status={props.manualSyncAction?.status}
        data-sync-action-terminal-result={terminal?.terminalResult ?? undefined}
        data-sync-action-terminal-run-id={terminal?.runId}
        disabled={busy}
        data-testid="companion-sync-now"
        onClick={props.onSync}
        type="button"
      >
        {busy ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
        <span>{label}</span>
      </button>
      {terminal?.terminalResult === 'failed' ? (
        <p aria-atomic="true" className="flex flex-col gap-1 text-sm text-error"
          data-testid="companion-sync-action-failed"
          role="alert">
          <span className="font-semibold">{t('companion.sync.action.failedTitle')}</span>
          <span>{props.failureDetail ?? t('companion.sync.action.failedFallback')}</span>
          <span>{t('companion.sync.action.failedPreserved')}</span>
        </p>
      ) : null}
    </div>
  );
}
