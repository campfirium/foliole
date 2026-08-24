import { useState } from 'react';

import { resolveSyncGroupDisplayHostName, type SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { leaveCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupDeparture';
import { setCompanionSyncPaused } from '../shared/platform/companion/sync/syncGroupProvider';
import type { CompanionSyncGroupProviderState } from '../shared/platform/companionWorkspaceSyncPluginTypes';

import {
  CompanionSyncGroupJoinApproval,
  useSyncGroupProviderState
} from './CompanionSyncGroupJoinApproval';

function LeaveSyncGroup() {
  const t = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  async function leave() {
    setLeaving(true); setErrorCode(null);
    try {
      await leaveCompanionSyncGroup();
      window.location.reload();
    } catch (error) {
      setLeaving(false);
      setErrorCode(error instanceof Error ? error.message : 'sync_group_departure_failed');
    }
  }
  return (
    <div className={confirming ? 'basis-full' : 'shrink-0'}>
      {!confirming ? (
        <button className="min-h-11 touch-manipulation rounded-md px-2 py-2 text-sm font-medium text-companion-text-secondary transition-colors active:bg-companion-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent"
          data-testid="companion-sync-group-leave" onClick={() => setConfirming(true)} type="button">
          {t('companion.sync.leave.button')}
        </button>
      ) : (
        <div className="border-t border-error/30 py-3">
          <p className="text-sm leading-6 text-companion-text-secondary">{t('companion.sync.leave.description')}</p>
          <div className="mt-3 flex gap-2">
            <button className="min-h-11 flex-1 touch-manipulation rounded-md border border-companion-divider px-3 py-2 text-sm font-semibold"
              disabled={leaving} onClick={() => setConfirming(false)} type="button">{t('common.cancel')}</button>
            <button className="min-h-11 flex-1 touch-manipulation rounded-md border border-error/60 px-3 py-2 text-sm font-semibold text-error"
              data-testid="companion-sync-group-leave-confirm" disabled={leaving}
              onClick={() => void leave()} type="button">
              {t(leaving ? 'companion.sync.leave.progress' : 'companion.sync.leave.button')}
            </button>
          </div>
          {errorCode ? <p className="mt-3 text-sm text-error" data-error-code={errorCode}
            data-testid="companion-sync-group-leave-error">{t('companion.sync.leave.error')}</p> : null}
        </div>
      )}
    </div>
  );
}

const PLATFORM_LABELS: Record<string, string> = {
  android: 'Android', darwin: 'macOS', ios: 'iOS', linux: 'Linux', win32: 'Windows'
};

function platformFor(kind: string) {
  const key = Object.keys(PLATFORM_LABELS).find((candidate) => kind.toLowerCase().includes(candidate));
  return key ? PLATFORM_LABELS[key]! : kind;
}

function SyncGroupDevices(props: {
  group: SyncGroupPayload;
  onTogglePause(): void;
  providerState: CompanionSyncGroupProviderState | null;
}) {
  const t = useTranslation();
  const paused = props.providerState?.sync_paused ?? false;
  return (
    <div aria-label={t('companion.sync.devices')} className="ml-4 divide-y divide-companion-divider border-t border-companion-divider pl-4" role="list">
      {props.group.members.filter((member) => member.state === 'active').map((member) => {
        const isLocal = member.host_name === props.group.local_host_name;
        return (
          <div className="flex min-h-14 items-center justify-between gap-4 py-2.5" key={member.host_name} role="listitem">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-semibold text-foreground">{member.host_name}</span>
              <span className="shrink-0 text-xs text-companion-text-tertiary">{platformFor(member.host_platform)}</span>
            </span>
            {isLocal ? (
              <button className="min-h-11 shrink-0 touch-manipulation rounded-md px-2 py-2 text-sm font-medium text-companion-text-secondary transition-colors active:bg-companion-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent disabled:opacity-45"
                data-testid="companion-sync-pause-toggle" disabled={!props.providerState}
                onClick={props.onTogglePause} type="button">
                {t(paused ? 'companion.sync.participation.resume' : 'companion.sync.participation.pause')}
              </button>
            ) : (
              <span className="shrink-0 text-sm text-companion-text-secondary">
                {t('companion.sync.member.active')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CompanionSyncGroupRows(props: { group: SyncGroupPayload }) {
  const t = useTranslation();
  const provider = useSyncGroupProviderState();
  function togglePause() {
    if (!provider.state) return;
    void setCompanionSyncPaused(!provider.state.sync_paused).then(provider.refresh);
  }
  return (
    <section className="border-y border-companion-divider text-foreground">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4">
        <h2 className="truncate text-base font-semibold text-foreground">
          {t('settings.companionSync.group.named', { name: resolveSyncGroupDisplayHostName(props.group) })}
        </h2>
        <LeaveSyncGroup />
      </div>
      <CompanionSyncGroupJoinApproval provider={provider} />
      <SyncGroupDevices group={props.group} onTogglePause={togglePause} providerState={provider.state} />
    </section>
  );
}
