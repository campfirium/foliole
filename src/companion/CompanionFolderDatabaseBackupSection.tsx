import { useEffect, useState } from 'react';

import type { CompanionFolderBackupState } from '../../lib/platform/companionFolderBackupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { backUpCompanionDatabase } from '../shared/platform/companion/folderBackup/companionFolderBackup';
import { getCompanionFolderBackupPort, supportsCompanionFolderDatabaseBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';

export function CompanionFolderDatabaseBackupSection() {
  const t = useTranslation();
  const supported = supportsCompanionFolderDatabaseBackup();
  const [state, setState] = useState<CompanionFolderBackupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!supported) return;
    let active = true;
    let receivedEvents = 0;
    const port = getCompanionFolderBackupPort();
    const subscription = port.addListener('backupStateChanged', ({ state: value }) => {
      receivedEvents += 1;
      if (active) { setState(value); setError(value.errorMessage); }
    });
    void subscription.then(async () => {
      const revision = receivedEvents;
      const value = await port.getState();
      if (active && receivedEvents === revision) { setState(value); setError(value.errorMessage); }
    }).catch((failure: unknown) => { if (active) setError(String(failure)); });
    return () => {
      active = false;
      void subscription.then((listener) => listener.remove()).catch(() => undefined);
    };
  }, [supported]);

  async function run(chooseDirectory: boolean) {
    setBusy(true);
    setError(null);
    try { setState((await backUpCompanionDatabase(chooseDirectory)).state); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  const working = busy || state?.phase === 'working';
  if (!supported) return null;
  return (
    <SettingsSection ariaLabel={t('companion.settings.storage.databaseBackup')} title={t('companion.settings.storage.databaseBackup')}>
      <SettingsRow title={state?.directoryLabel ?? t('companion.settings.storage.backupFolder')}
        description={t('companion.settings.storage.databaseBackupHint')}>
        <SettingsControlSlot>
          <AppButton data-testid="companion-database-backup" disabled={working} onClick={() => void run(false)} size="sm">
            {t(working ? 'companion.settings.storage.backupWorking' : 'companion.settings.storage.backupNow')}
          </AppButton>
          {state?.configured ? <AppButton disabled={working} onClick={() => void run(true)} size="sm">
            {t('companion.settings.storage.changeBackupFolder')}
          </AppButton> : null}
        </SettingsControlSlot>
      </SettingsRow>
      {state?.databaseSavedAt ? <p role="status">{t('companion.settings.storage.backupSaved')} {new Date(state.databaseSavedAt).toLocaleString()}</p> : null}
      {state?.databaseSavedAt ? <p>{t('companion.settings.storage.backupAttachmentsUnchecked')}</p> : null}
      {state?.attachmentFilesPending != null ? <p>{t('companion.settings.storage.backupAttachmentsPending')} {state.attachmentFilesPending}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </SettingsSection>
  );
}
