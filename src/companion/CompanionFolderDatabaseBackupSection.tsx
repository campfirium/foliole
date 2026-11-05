import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { clearCompanionFolderBackupDirectory, setCompanionAutomaticFolderBackup } from '../shared/platform/companion/folderBackup/companionAutomaticFolderBackup';
import { backUpCompanionDatabase } from '../shared/platform/companion/folderBackup/companionFolderBackup';
import { supportsCompanionFolderDatabaseBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';
import { AppButton, AppSwitch, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';

import { CompanionBackupLocationDialog } from './CompanionBackupLocationDialog';
import { companionBackupSummary } from './companionBackupSummary';
import { useCompanionFolderBackupState } from './useCompanionFolderBackupState';

export function CompanionFolderDatabaseBackupSection() {
  const t = useTranslation();
  const supported = supportsCompanionFolderDatabaseBackup();
  const preview = getCompanionRuntimeCapability().kind === 'browser-preview';
  const { state, setState, error, setError, automatic, setAutomatic } = useCompanionFolderBackupState(supported);
  const [changingAutomatic, setChangingAutomatic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
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
  if (!supported && !preview) return null;
  return (
    <section>
      {preview ? <p className="mb-3 text-sm text-companion-text-secondary">{t('companion.settings.storage.previewUnavailable')}</p> : null}
      <p className="mb-5 text-sm leading-6 text-companion-text-secondary">{t('companion.settings.storage.databaseBackupHint')}</p>
      <SettingsSection ariaLabel={t('companion.settings.storage.databaseBackup')}>
        <SettingsRow controlLayout="inline" title={t('companion.settings.storage.backupFolder')}>
          <SettingsControlSlot><AppButton disabled={working || !supported} size="sm"
            onClick={() => state?.configured ? setLocationOpen(true) : void run(true)}>
            {state?.directoryLabel ?? t('companion.settings.storage.chooseBackupFolder')}
          </AppButton></SettingsControlSlot>
        </SettingsRow>
        <SettingsRow controlLayout="inline" title={t('companion.settings.storage.automaticBackup')} description={t('companion.settings.storage.automaticBackupHint')}>
          <SettingsControlSlot><AppSwitch aria-label={t('companion.settings.storage.automaticBackup')} checked={automatic === true}
            disabled={automatic === null || changingAutomatic || forgetting || (!state?.configured && automatic !== true)}
            onCheckedChange={value => void toggleAutomatic(value)} /></SettingsControlSlot>
        </SettingsRow>
        <SettingsRow controlLayout="inline" description={<span role="status">{!supported ? '—' : companionBackupSummary(state, automatic, error, t)}</span>}>
          <SettingsControlSlot><AppButton data-testid="companion-database-backup" disabled={working || !supported || !state?.configured}
            onClick={() => void run(false)} size="sm">
            {t(working ? 'companion.settings.storage.backupWorking' : 'companion.settings.storage.backupNow')}
          </AppButton></SettingsControlSlot>
        </SettingsRow>
        {error ? <p className="text-sm leading-6 text-error" role="alert">{error}</p> : null}
      </SettingsSection>
      <CompanionBackupLocationDialog open={locationOpen} onOpenChange={setLocationOpen} working={working}
        label={state?.directoryLabel ?? ''} onForget={() => { setLocationOpen(false); void forgetDirectory(); }}
        onChange={() => { setLocationOpen(false); void run(true); }} />
    </section>
  );
}
