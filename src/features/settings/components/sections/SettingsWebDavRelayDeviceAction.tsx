import { useState } from 'react';

import type { DesktopSyncGroupOverviewPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { enableDesktopWebDavRelay } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton } from '../../../../shared/ui';

export function SettingsWebDavRelayDeviceAction(props: {
  groupId: string;
  deviceId: string;
  disabled: boolean;
  relay: NonNullable<DesktopSyncGroupOverviewPayload['webdav_relay']>;
}) {
  const t = useTranslation();
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  if (props.relay.device_id) {
    if (props.relay.device_id !== props.deviceId) return null;
    return <span role="status" className="text-ui-sm text-muted-foreground">
      {t(props.relay.delivered ? 'settings.companionSync.webdav.enabled' : 'settings.companionSync.webdav.waiting')}
    </span>;
  }

  async function enable() {
    try {
      const pending = enableDesktopWebDavRelay(props.groupId, props.deviceId);
      if (!pending) return;
      setStatus('running');
      await pending;
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  return <div className="flex flex-col items-end gap-1">
    <SettingsButton disabled={props.disabled || status === 'running'} onClick={() => void enable()}>
      {t('settings.companionSync.webdav.enable')}
    </SettingsButton>
    {status === 'error' ? <span role="alert" className="max-w-48 text-right text-ui-sm text-muted-foreground">
      {t('settings.companionSync.webdav.deviceUnavailable')}
    </span> : null}
  </div>;
}
