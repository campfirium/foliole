import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_WIDE_CONTROL_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow } from '../../../../shared/ui';

export function PublishingConnectionFooter(props: {
  action?: ReactNode;
  connected: boolean;
  title: string;
}) {
  const t = useTranslation();
  return (
    <SettingsRow
      className="border-t border-settings-divider/70"
      description={t(props.connected ? 'settings.publishing.connectionState.connected' : 'settings.publishing.connectionState.notConnected')}
      title={props.title}
    >
      {props.action ? (
        <SettingsControlSlot className={SETTINGS_WIDE_CONTROL_WIDTH_CLASS_NAME}>
          {props.action}
        </SettingsControlSlot>
      ) : null}
    </SettingsRow>
  );
}
