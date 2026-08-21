import type { DesktopCompanionPairRequestPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsButton } from '../../../../shared/ui';

export function SettingsSyncGroupJoinRequests(props: {
  disabled: boolean;
  onApprove(id: string): void;
  onReject(id: string): void;
  requests: DesktopCompanionPairRequestPayload[];
}) {
  const t = useTranslation();
  if (props.requests.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" role="list">
      {props.requests.map((request) => (
        <div className="flex items-center justify-between gap-4" key={request.pair_request_id} role="listitem">
          <span className="min-w-0 truncate text-sm text-foreground">{request.host_name}</span>
          <span className="flex shrink-0 gap-2">
            <SettingsButton disabled={props.disabled} onClick={() => props.onReject(request.pair_request_id)}>
              {t('settings.companionSync.group.join.reject')}
            </SettingsButton>
            <SettingsButton disabled={props.disabled} onClick={() => props.onApprove(request.pair_request_id)}>
              {t('settings.companionSync.group.join.approve')}
            </SettingsButton>
          </span>
        </div>
      ))}
    </div>
  );
}
