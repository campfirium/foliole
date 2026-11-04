import { useEffect, useState } from 'react';

import type { CompanionFolderBackupState } from '../../lib/platform/companionFolderBackupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { clearCompanionFolderBackupDirectory, getCompanionAutomaticFolderBackup, setCompanionAutomaticFolderBackup, subscribeCompanionAutomaticFolderBackup } from '../shared/platform/companion/folderBackup/companionAutomaticFolderBackup';
import { backUpCompanionDatabase } from '../shared/platform/companion/folderBackup/companionFolderBackup';
import { getCompanionFolderBackupPort, supportsCompanionFolderDatabaseBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { getCompanionFolderBackupState, subscribeCompanionFolderBackupWork } from '../shared/platform/companion/folderBackup/companionFolderBackupState';
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
    const automaticSubscription = subscribeCompanionAutomaticFolderBackup(value => { automaticRevision++; if (active) setAutomatic(value); });
    void getCompanionAutomaticFolderBackup().then(value => { if (active && automaticRevision === 0) setAutomatic(value); })
      .catch((failure: unknown) => { if (active) setError(String(failure)); });
    const port = getCompanionFolderBackupPort();
    const refresh = (value?: CompanionFolderBackupState) => {
      const revision = ++receivedEvents;
      void getCompanionFolderBackupState(value).then(next => {
        if (active && receivedEvents === revision) { setState(next); setError(next.errorMessage); }
      }).catch((failure: unknown) => { if (active) setError(String(failure)); });
    };
    const workSubscription = subscribeCompanionFolderBackupWork(() => refresh());
    const subscription = port.addListener('backupStateChanged', ({ state: value }) => {
      if (active) { setState(value); setError(value.errorMessage); refresh(value); }
    });
    void subscription.then(() => refresh()).catch((failure: unknown) => { if (active) setError(String(failure)); });
    return () => {
      active = false;
      automaticSubscription();
      workSubscription();
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
  const [forgetting, setForgetting] = useState(false);
  async function run(chooseDirectory: boolean) {
    setBusy(true);
    setError(null);
    try { setState((await backUpCompanionDatabase(chooseDirectory)).state); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  async function forgetDirectory() {
    setBusy(true); setForgetting(true);
    try { setState(await clearCompanionFolderBackupDirectory()); setAutomatic(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); setForgetting(false); }
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
          {state?.configured ? <AppButton disabled={working} onClick={() => void forgetDirectory()} size="sm">
            {t('companion.settings.storage.forgetBackupFolder')}
          </AppButton> : null}
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title={t('companion.settings.storage.automaticBackup')} description={t('companion.settings.storage.automaticBackupHint')}>
        <SettingsControlSlot>
          <AppSwitch aria-label={t('companion.settings.storage.automaticBackup')} checked={automatic === true}
            disabled={automatic === null || changingAutomatic || forgetting || (!state?.configured && automatic !== true)}
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
