import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { openDesktopWebDavRelayLog } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton } from '../../../../shared/ui';

export function SettingsWebDavLogButton() {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'empty' | 'failed' | null>(null);

  async function openLog() {
    setBusy(true);
    setResult(null);
    try {
      if (await openDesktopWebDavRelayLog() === 'empty') setResult('empty');
    } catch {
      setResult('failed');
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-col items-end gap-1">
    {result === 'empty' && <span role="status" className="text-ui-sm text-muted-foreground">
      {t('settings.companionSync.webdav.logEmpty')}
    </span>}
    {result === 'failed' && <span role="alert" className="text-ui-sm text-muted-foreground">
      {t('settings.companionSync.webdav.openLogFailed')}
    </span>}
    <SettingsButton disabled={busy} onClick={() => void openLog()}>
      {t('settings.companionSync.webdav.openLog')}
    </SettingsButton>
  </div>;
}
