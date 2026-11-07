import { resolveSyncGroupDisplayDeviceName, type SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { displaySyncGroupPlatform } from '../../lib/platform/syncGroupPlatform';
import { syncGroupDeviceDisplayName } from '../../lib/platform/syncGroupRemovalModel';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { setCompanionSyncPaused } from '../shared/platform/companion/sync/syncGroupProvider';
import type { CompanionSyncGroupProviderState } from '../shared/platform/companionWorkspaceSyncPluginTypes';
import { SyncGroupRemovingDevices } from '../shared/ui/SyncGroupRemovingDevices';

import { CompanionLeaveSyncGroup } from './CompanionLeaveSyncGroup';
import {
  CompanionSyncGroupJoinApproval,
  useSyncGroupProviderState
} from './CompanionSyncGroupJoinApproval';
import { useCompanionSyncParticipation } from './useCompanionSyncParticipation';

function SyncGroupDevices(props: {
  group: SyncGroupPayload;
  onTogglePause(): void;
  paused: boolean;
  providerState: CompanionSyncGroupProviderState | null;
}) {
  const t = useTranslation();
  const activeDevices = props.group.devices.filter((device) => device.state === 'active' &&
    !props.group.removing_devices?.some(entry => entry.target.device_identity_key === device.device_identity_key));
  return (
    <div aria-label={t('companion.sync.devices')} className="ml-4 divide-y divide-companion-divider border-t border-companion-divider pl-4" role="list">
      {activeDevices.map((device) => {
        const isLocal = device.device_identity_key === props.group.local_device_identity_key;
        return (
          <div className="flex min-h-14 items-center justify-between gap-4 py-2.5" key={device.device_identity_key} role="listitem">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-semibold text-foreground">{props.group.device_display_names?.[device.device_identity_key] ?? syncGroupDeviceDisplayName(device, props.group.devices)}</span>
              <span className="shrink-0 text-xs text-companion-text-tertiary">
                {displaySyncGroupPlatform(device.platform)}
              </span>
            </span>
            {isLocal ? (
              <button className="min-h-11 shrink-0 touch-manipulation rounded-md px-2 py-2 text-sm font-medium text-companion-text-secondary transition-colors active:bg-companion-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent disabled:opacity-45"
                data-testid="companion-sync-pause-toggle" disabled={!props.providerState}
                onClick={props.onTogglePause} type="button">
                {t(props.paused ? 'companion.sync.participation.resume' : 'companion.sync.participation.pause')}
              </button>
            ) : (
              <span className="shrink-0 text-sm text-companion-text-secondary">
                {t('companion.sync.member.active')}
              </span>
            )}
          </div>
        );
      })}
      <SyncGroupRemovingDevices entries={props.group.removing_devices ?? []} requiredCount={activeDevices.length} />
    </div>
  );
}

export function CompanionSyncGroupRows(props: { group: SyncGroupPayload; onLeave(): Promise<unknown> }) {
  const t = useTranslation();
  const provider = useSyncGroupProviderState();
  const participation = useCompanionSyncParticipation();
  function togglePause() {
    if (!provider.state) return;
    void setCompanionSyncPaused(!participation.sync_paused);
  }
  return (
    <section className="border-y border-companion-divider text-foreground">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4">
        <h2 className="truncate text-base font-semibold text-foreground">
          {t('settings.companionSync.group.named', { name: resolveSyncGroupDisplayDeviceName(props.group) })}
        </h2>
        <CompanionLeaveSyncGroup onLeave={props.onLeave} />
      </div>
      <CompanionSyncGroupJoinApproval provider={provider} />
      <SyncGroupDevices group={props.group} onTogglePause={togglePause}
        paused={participation.sync_paused} providerState={provider.state} />
    </section>
  );
}
