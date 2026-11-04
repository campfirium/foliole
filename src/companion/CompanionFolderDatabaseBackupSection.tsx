import { useEffect, useState } from 'react';

import type { CompanionFolderBackupState } from '../../lib/platform/companionFolderBackupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { getCompanionAutomaticFolderBackup, setCompanionAutomaticFolderBackup, subscribeCompanionAutomaticFolderBackup } from '../shared/platform/companion/folderBackup/companionAutomaticFolderBackup';
import { backUpCompanionDatabase } from '../shared/platform/companion/folderBackup/companionFolderBackup';
import { getCompanionFolderBackupPort, supportsCompanionFolderDatabaseBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { AppButton, AppSwitch, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';

function useFolderBackupState(supported: boolean) {
  const [state, setState] = useState<CompanionFolderBackupState | null>(null);
  const [automatic, setAutomatic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!supported) return;
    let active = true;
    let receivedEvents = 0;
    let automaticRevision = 0;
    const automaticSubscription = subscribeCompanionAutomaticFolderBackup(value => { automaticRevision++; if (active && automaticRevision === 0) setAutomatic(value); });
    void getCompanionAutomaticFolderBackup().then(value => { if (active && automaticRevision === 0) setAutomatic(value); })
      .catch((failure: unknown) => { if (active) setError(String(failure)); });
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
      automaticSubscription();
      void subscription.then((listener) => listener.remove()).catch(() => undefined);
    };
  }, [supported]);

  return { state, setState, error, setError, automatic, setAutomatic };
}

export function CompanionFolderDatabaseBackupSection() {
  const t = useTranslation();
  const supported = supportsCompanionFolderDatabaseBackup();
  const { state, setState, error, setError, automatic, setAutomatic } = useFolderBackupState(supported);
  const [changingAutomatic, setChangingAutomatic] = useState(false);
  const [busy, setBusy] = useState(false);
  async function run(chooseDirectory: boolean) {
    setBusy(true);
    setError(null);
    try { setState((await backUpCompanionDatabase(chooseDirectory)).state); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  async function toggleAutomatic(enabled: boolean) {
    setChangingAutomatic(true);
    try { await setCompanionAutomaticFolderBackup(enabled); setAutomatic(enabled); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setChangingAutomatic(false); }
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
      <SettingsRow title={t('companion.settings.storage.automaticBackup')} description={t('companion.settings.storage.automaticBackupHint')}>
        <SettingsControlSlot>
          <AppSwitch aria-label={t('companion.settings.storage.automaticBackup')} checked={automatic === true}
            disabled={automatic === null || changingAutomatic || (!state?.configured && automatic !== true)}
            onCheckedChange={value => void toggleAutomatic(value)} />
        </SettingsControlSlot>
      </SettingsRow>
      {state?.databaseSavedAt ? <p role="status">{t('companion.settings.storage.backupSaved')} {new Date(state.databaseSavedAt).toLocaleString()}</p> : null}
      {state?.databaseSavedAt ? <p>{t('companion.settings.storage.backupAttachmentsUnchecked')}</p> : null}
      {state?.attachmentFilesPending != null ? <p>{t('companion.settings.storage.backupAttachmentsPending')} {state.attachmentFilesPending}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </SettingsSection>
  );
}
