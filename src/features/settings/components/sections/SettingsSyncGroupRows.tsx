import type { DesktopCompanionPairRequestPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow
} from '../../../../shared/ui';

import { SettingsSyncGroupJoinRequests } from './SettingsSyncGroupJoinRequests';

function deviceKindLabel(kind: string) {
  if (kind.includes('android')) return 'Android';
  if (kind === 'darwin') return 'macOS';
  if (kind === 'win32') return 'Windows';
  return kind;
}

function DeviceList({ group }: { group: SyncGroupPayload }) {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-2" role="list">
      {group.members.map((member) => (
        <div className="flex items-center justify-between gap-4 py-1" key={member.device_id} role="listitem">
          <span className="truncate text-sm text-foreground">{member.device_name}</span>
          <span className="shrink-0 text-xs text-foreground/55">
            {deviceKindLabel(member.device_kind)} · {t(member.state === 'active'
              ? 'settings.companionSync.group.member.active'
              : 'settings.companionSync.group.member.provisioning')}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SettingsSyncGroupRows(props: {
  group: SyncGroupPayload | null;
  isBusy: boolean;
  isCreating: boolean;
  onCreate(): void;
  onApprove(id: string): void;
  onReject(id: string): void;
  pendingRequests: DesktopCompanionPairRequestPayload[];
}) {
  const t = useTranslation();
  if (!props.group) {
    return (
      <SettingsRow description={t('settings.companionSync.group.empty.description')} title={t('settings.companionSync.group.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <SettingsButton disabled={props.isBusy} loading={props.isCreating} onClick={props.onCreate}>
            {t('settings.companionSync.group.create')}
          </SettingsButton>
        </SettingsControlSlot>
      </SettingsRow>
    );
  }
  return (
    <>
      <SettingsRow description={t('settings.companionSync.group.description')} title={t('settings.companionSync.group.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <span className="text-sm font-medium text-foreground">{props.group.display_name}</span>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description={t('settings.companionSync.group.devices.description')} title={t('settings.companionSync.group.devices.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <DeviceList group={props.group} />
        </SettingsControlSlot>
      </SettingsRow>
      {props.pendingRequests.length > 0 ? (
        <SettingsRow description={t('settings.companionSync.group.join.description')} title={t('settings.companionSync.group.join.title')}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <SettingsSyncGroupJoinRequests disabled={props.isBusy} onApprove={props.onApprove}
              onReject={props.onReject} requests={props.pendingRequests} />
          </SettingsControlSlot>
        </SettingsRow>
      ) : null}
    </>
  );
}
