import type { DesktopSyncGroupJoinRequestSummaryPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsButton } from '../../../../shared/ui';

export function SettingsSyncGroupJoinRequests(props: {
  disabled: boolean;
  onAccept(id: string): void;
  onReject(id: string): void;
  requests: DesktopSyncGroupJoinRequestSummaryPayload[];
}) {
  const t = useTranslation();
  if (props.requests.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" role="list">
      {props.requests.map((request) => (
        <div className="flex items-center justify-between gap-4" key={request.request_id} role="listitem">
          <span className="min-w-0 truncate text-sm text-foreground">{request.device_name}</span>
          <span className="flex shrink-0 gap-2">
            <SettingsButton disabled={props.disabled} onClick={() => props.onReject(request.request_id)}>
              {t('settings.companionSync.group.join.reject')}
            </SettingsButton>
            <SettingsButton disabled={props.disabled} onClick={() => props.onAccept(request.request_id)}>
              {t('settings.companionSync.group.join.approve')}
            </SettingsButton>
          </span>
        </div>
      ))}
    </div>
  );
}
