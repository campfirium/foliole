import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsControlSlot, SettingsRow } from '../../../../shared/ui';

export function PublishingConnectionRow(props: {
  action?: ReactNode;
  connected: boolean;
  title: string;
}) {
  const t = useTranslation();
  return (
    <SettingsRow
      description={t(props.connected ? 'settings.publishing.connectionState.connected' : 'settings.publishing.connectionState.notConnected')}
      title={props.title}
    >
      {props.action ? <SettingsControlSlot className="w-[min(360px,100%)]">{props.action}</SettingsControlSlot> : null}
    </SettingsRow>
  );
}
