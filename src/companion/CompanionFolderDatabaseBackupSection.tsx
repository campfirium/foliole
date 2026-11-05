import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { setCompanionAutomaticFolderBackup } from '../shared/platform/companion/folderBackup/companionAutomaticFolderBackup';
import { backUpCompanionDatabase } from '../shared/platform/companion/folderBackup/companionFolderBackup';
import { supportsCompanionFolderDatabaseBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';
import { getCompanionSettingsPreview } from '../shared/platform/companionSettingsPreview';
import { AppButton, AppSwitch, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';
import { SettingsValueRow } from '../shared/ui/SettingsValueRow';

import { CompanionBackupLocationDialog } from './CompanionBackupLocationDialog';
import { companionBackupSummary } from './companionBackupSummary';
import { useCompanionFolderBackupState } from './useCompanionFolderBackupState';

export function CompanionFolderDatabaseBackupSection() {
  const t = useTranslation();
  const presentation = getCompanionSettingsPreview();
  const supported = supportsCompanionFolderDatabaseBackup() || Boolean(presentation);
  const preview = getCompanionRuntimeCapability().kind === 'browser-preview';
  const { state, setState, error, setError, automatic, setAutomatic } = useCompanionFolderBackupState(supported);
  const [changingAutomatic, setChangingAutomatic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  async function run(chooseDirectory: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = presentation ? await presentation.backUp(chooseDirectory) : (await backUpCompanionDatabase(chooseDirectory)).state;
      setState(next);
      return next;
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  async function toggleAutomatic(enabled: boolean) {
    setChangingAutomatic(true);
    try {
      if (enabled && !state?.configured && !(await run(true))?.configured) return;
      await (presentation ? presentation.setAutomaticBackup(enabled) : setCompanionAutomaticFolderBackup(enabled)); setAutomatic(enabled); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setChangingAutomatic(false); }
  }

  const working = busy || state?.phase === 'working';
  const failed = Boolean(error || state?.errorMessage || state?.phase === 'failed');
  if (!supported && !preview) return null;
  return (
    <section>
      <p data-settings-page-description>{t('companion.settings.storage.databaseBackupHint')}</p>
      <SettingsSection ariaLabel={t('companion.settings.storage.databaseBackup')}>
        <SettingsValueRow title={t('companion.settings.storage.backupFolder')}
          value={state?.directoryLabel ?? t('companion.settings.storage.noBackupFolder')}
          disabled={working || !supported} onClick={() => state?.configured ? setLocationOpen(true) : void run(true)} />
        <SettingsRow controlLayout="inline" title={t('companion.settings.storage.automaticBackup')} description={t('companion.settings.storage.automaticBackupHint')}>
          <SettingsControlSlot><AppSwitch aria-label={t('companion.settings.storage.automaticBackup')} checked={automatic === true}
            disabled={!state || automatic === null || changingAutomatic || !supported}
            onCheckedChange={value => void toggleAutomatic(value)} /></SettingsControlSlot>
        </SettingsRow>
        <SettingsRow controlLayout="inline" description={<>
          <span role="status" data-settings-action-status>{companionBackupSummary(state, automatic, error, t)}</span>
          {failed ? <span className="mt-1 block" role="alert">{t('companion.settings.storage.backupReselectHint')}</span> : null}
        </>}>
          <SettingsControlSlot><AppButton data-testid="companion-database-backup" disabled={working || !supported || (!state?.configured && !failed)}
            onClick={() => void run(failed)} size="sm">
            {t(working ? 'companion.settings.storage.backupWorking' : failed ? 'companion.settings.storage.backupReselect' : 'companion.settings.storage.backupNow')}
          </AppButton></SettingsControlSlot>
        </SettingsRow>
      </SettingsSection>
      <CompanionBackupLocationDialog open={locationOpen} onOpenChange={setLocationOpen} working={working}
        label={state?.directoryLabel ?? ''}
        onChange={() => { setLocationOpen(false); void run(true); }} />
    </section>
  );
}
