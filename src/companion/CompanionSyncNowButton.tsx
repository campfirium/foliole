import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isSyncRunFinishedEvent } from '../shared/platform/companionSyncActivityEvents';
import { AppSpinner } from '../shared/ui';

import type { CompanionManualSyncAction } from './companionManualSyncAction';
import { useCompanionSyncGroupProviderAvailability } from './companionSyncGroupProviderAvailability';

export function CompanionSyncNowButton(props: {
  isSyncing: boolean;
  manualSyncAction?: CompanionManualSyncAction | null;
  runtimeBootedAt?: string | null;
  syncEvents?: NativeCompanionSyncEvent[];
  onSync(): void;
}) {
  const t = useTranslation();
  const providerAvailable = useCompanionSyncGroupProviderAvailability();
  const busy = props.isSyncing || Boolean(props.manualSyncAction);
  const terminalEvent = props.syncEvents?.find(isSyncRunFinishedEvent) ?? null;
  const label = props.manualSyncAction?.mode === 'joined'
    ? t('companion.sync.action.joiningCurrent')
    : t(busy ? 'companion.browse.syncing' : 'companion.sync.action.syncNow');
  return (
    <button
      aria-busy={busy || undefined}
      className="inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-border-strong bg-foreground px-4 py-2.5 text-sm font-semibold text-bg-panel transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent disabled:cursor-not-allowed disabled:opacity-55"
      data-sync-action-mode={props.manualSyncAction?.mode}
      data-sync-run-id={props.manualSyncAction?.runId ?? undefined}
      data-sync-runtime-booted-at={props.runtimeBootedAt ?? undefined}
      data-sync-terminal-result={terminalEvent?.result}
      data-sync-terminal-run-id={terminalEvent?.run_id}
      data-sync-terminal-started-at={terminalEvent?.started_at}
      disabled={busy || !providerAvailable}
      data-testid="companion-sync-now"
      onClick={props.onSync}
      type="button"
    >
      {busy ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
      <span>{label}</span>
    </button>
  );
}
