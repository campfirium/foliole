import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

export function CompanionSyncNowButton(props: {
  isSyncing: boolean;
  onSync(): void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-busy={props.isSyncing || undefined}
      className="inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-border-strong bg-foreground px-4 py-2.5 text-sm font-semibold text-bg-panel transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent disabled:cursor-not-allowed disabled:opacity-55"
      disabled={props.isSyncing}
      data-testid="companion-sync-now"
      onClick={props.onSync}
      type="button"
    >
      {props.isSyncing ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
      <span>{t(props.isSyncing ? 'companion.browse.syncing' : 'companion.sync.action.syncNow')}</span>
    </button>
  );
}
