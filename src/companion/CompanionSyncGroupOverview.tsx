import { resolveSyncGroupDisplayDeviceName, type SyncGroupMemberPayload, type SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

const PLATFORM_LABELS: Record<string, string> = {
  android: 'Android', darwin: 'macOS', ios: 'iOS', linux: 'Linux', win32: 'Windows'
};

function platformFor(kind: string) {
  const key = Object.keys(PLATFORM_LABELS).find((candidate) => kind.toLowerCase().includes(candidate));
  return key ? PLATFORM_LABELS[key]! : kind;
}

function isDesktopMember(member: SyncGroupMemberPayload) {
  return ['darwin', 'linux', 'win32'].some((kind) => member.device_kind.toLowerCase().includes(kind));
}

function overviewMember(group: SyncGroupPayload) {
  const remoteMembers = group.members.filter((member) => member.device_id !== group.local_device_id);
  const active = remoteMembers.filter((member) => member.state === 'active');
  if (active.length === 1) return active[0]!;
  if (active.length > 1) return active.find(isDesktopMember) ?? active[0]!;
  const desktops = remoteMembers.filter(isDesktopMember);
  return desktops.find((member) => member.device_id === group.created_by_device_id)
    ?? desktops[0]
    ?? remoteMembers[0]
    ?? null;
}

export function CompanionSyncGroupOverview(props: {
  group: SyncGroupPayload;
  isSyncing: boolean;
  onOpen(): void;
  sourceDeviceId: string | null;
}) {
  const t = useTranslation();
  const member = overviewMember(props.group);
  const groupName = t('settings.companionSync.group.named', {
    name: resolveSyncGroupDisplayDeviceName(props.group)
  });
  return (
    <section className="border-y border-companion-divider text-foreground">
      <div className="flex items-start justify-between gap-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t('companion.sync.group.current')}</h2>
          <p className="mt-1 truncate text-base font-semibold text-foreground">{groupName}</p>
        </div>
        <button className="min-h-11 shrink-0 touch-manipulation rounded-md px-2 py-2 text-sm font-medium text-companion-text-secondary transition active:bg-companion-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent"
          data-testid="companion-sync-group-open" onClick={props.onOpen} type="button">
          {t('companion.sync.group.details')}
        </button>
      </div>
      {member ? (
        <div className="flex min-h-14 items-center justify-between gap-4 border-t border-companion-divider py-2.5"
          data-testid="companion-sync-group-device">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{member.device_name}</span>
            <span className="shrink-0 text-xs text-companion-text-tertiary">{platformFor(member.device_kind)}</span>
          </span>
          {props.isSyncing && member.device_id === props.sourceDeviceId ? (
            <span className="flex shrink-0 items-center gap-2 text-sm text-companion-text-secondary"
              data-testid="companion-sync-source-indicator">
              <AppSpinner decorative size="sm" /><span className="sr-only">{t('companion.sync.syncing')}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
