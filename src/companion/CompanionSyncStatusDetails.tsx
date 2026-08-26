import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isFullSyncCompletedEvent } from '../shared/platform/companionSyncEventSemantics';

import { isReportableSyncEvent } from './companionSyncActivityCopy';
import { CompanionSyncActivityPage } from './CompanionSyncActivityPage';
import {
  CompanionSyncGroupJoinApproval,
  useSyncGroupProviderState
} from './CompanionSyncGroupJoinApproval';
import { CompanionSyncGroupOverview } from './CompanionSyncGroupOverview';
import { CompanionSyncGroupRows } from './CompanionSyncGroupRows';
import { formatClock, resolveLastSyncRow } from './companionSyncStatusRows';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

type SyncStatusDetailsProps = {
  endpointUrl: string;
  lastSyncedAt: string | null;
  syncConflictCount: number;
  syncEvents: NativeCompanionSyncEvent[];
  syncProgress: CompanionDesktopSyncProgress | null;
  syncGroup: SyncGroupPayload;
  status: 'idle' | 'loading' | 'syncing';
  page: CompanionSettingsPage;
  onOpenPage(page: CompanionSettingsPage): void;
};

function SettingsRow(props: { detail?: string; label: string; value: string; valueTone?: 'default' | 'error' | 'success' }) {
  const tone = props.valueTone === 'error' ? 'text-error'
    : props.valueTone === 'success' ? 'text-companion-accent' : 'text-foreground';
  return (
    <div className="min-h-14 border-b border-companion-divider px-1 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold leading-5 text-foreground">{props.label}</span>
        <span className={`max-w-[52%] shrink-0 break-words text-right text-sm font-semibold leading-5 ${tone}`}>
          {props.value}
        </span>
      </div>
      {props.detail ? <span className="mt-2 block text-sm leading-6 text-companion-text-secondary">{props.detail}</span> : null}
    </div>
  );
}

function SettingsLinkRow(props: { label: string; onClick(): void; value: string }) {
  return (
    <button className="min-h-14 w-full touch-manipulation border-b border-companion-divider px-1 py-3 text-left"
      onClick={props.onClick} type="button">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold leading-5 text-foreground">{props.label}</span>
        <span className="max-w-[52%] shrink-0 break-words text-right text-sm font-semibold leading-5 text-foreground">
          {props.value}
        </span>
      </div>
    </button>
  );
}

function SyncActivitySummary(props: { events: NativeCompanionSyncEvent[]; onOpen(): void }) {
  const t = useTranslation();
  const event = props.events.find(isReportableSyncEvent) ?? null;
  const status = event?.status === 'completed'
    ? t(isFullSyncCompletedEvent(event) ? 'companion.sync.synced' : 'companion.sync.checked')
    : event?.status === 'failed' ? t('companion.sync.failed') : t('companion.sync.noActivity');
  const value = event ? `${status} ${formatClock(event.occurred_at, t)}` : status;
  return <SettingsLinkRow label={t('companion.sync.activity.row')} onClick={props.onOpen} value={value} />;
}

function SyncOverview(props: SyncStatusDetailsProps & { provider: ReturnType<typeof useSyncGroupProviderState> }) {
  const t = useTranslation();
  const lastSync = resolveLastSyncRow({ ...props, t });
  return (
    <div className="space-y-5">
      <div className="border-y border-companion-divider">
        <SettingsRow detail={lastSync.detail} label={lastSync.label} value={lastSync.value}
          valueTone={lastSync.valueTone} />
        {props.syncConflictCount > 0 ? (
          <SettingsRow label={t('companion.sync.issuesToResolve')} value={`${props.syncConflictCount}`} valueTone="error" />
        ) : null}
      </div>
      <CompanionSyncGroupJoinApproval provider={props.provider} />
      <CompanionSyncGroupOverview group={props.syncGroup} isSyncing={props.status === 'syncing'}
        onOpen={() => props.onOpenPage('syncGroup')} sourceHostName={null} />
      <div className="border-y border-companion-divider">
        <SyncActivitySummary events={props.syncEvents} onOpen={() => props.onOpenPage('syncActivity')} />
      </div>
    </div>
  );
}

export function CompanionSyncStatusDetails(props: SyncStatusDetailsProps) {
  const provider = useSyncGroupProviderState(props.page !== 'syncGroup');
  if (props.page === 'syncGroup' || props.page === 'syncConnection') {
    return <CompanionSyncGroupRows group={props.syncGroup} />;
  }
  if (props.page === 'syncActivity') {
    return <CompanionSyncActivityPage events={props.syncEvents} status={props.status} syncProgress={props.syncProgress} />;
  }
  return <SyncOverview {...props} provider={provider} />;
}
