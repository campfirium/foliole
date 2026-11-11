import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { openDesktopWebDavRelayLog } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton } from '../../../../shared/ui';

export function SettingsWebDavLogButton() {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openLog() {
    setBusy(true);
    setFailed(false);
    try {
      await openDesktopWebDavRelayLog();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <>
    {failed && <span role="alert" className="text-ui-sm text-muted-foreground">
      {t('settings.companionSync.webdav.openLogFailed')}
    </span>}
    <SettingsButton disabled={busy} onClick={() => void openLog()}>
      {t('settings.companionSync.webdav.openLog')}
    </SettingsButton>
  </>;
}
