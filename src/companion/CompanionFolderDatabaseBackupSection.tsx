import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { setCompanionAutomaticFolderBackup } from '../shared/platform/companion/folderBackup/companionAutomaticFolderBackup';
import { backUpCompanionDatabase } from '../shared/platform/companion/folderBackup/companionFolderBackup';
import { isCompanionFolderBackupOtherBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupDirectoryFailure';
import { supportsCompanionFolderDatabaseBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { getCompanionSettingsPreview } from '../shared/platform/companion/preview/companionSettingsPreview';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';
import { AppButton, AppSwitch, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';
import { SettingsValueRow } from '../shared/ui/SettingsValueRow';

import { CompanionBackupLocationDialog, CompanionBackupReplacePrompt } from './CompanionBackupLocationDialog';
import { CompanionBackupRestoreSection } from './CompanionBackupRestoreSection';
import { companionBackupNeedsFolder, companionBackupSummary } from './companionBackupSummary';
import { useCompanionFolderBackupState } from './useCompanionFolderBackupState';

async function requestBackup(chooseDirectory: boolean, replaceExisting: boolean) {
  const presentation = getCompanionSettingsPreview();
  if (presentation) return presentation.backUp(chooseDirectory);
  return (await (replaceExisting ? backUpCompanionDatabase(false, { replaceExisting }) : backUpCompanionDatabase(chooseDirectory))).state;
}

type BackupState = ReturnType<typeof useCompanionFolderBackupState>;

/** The backup status line and its one action: back up now, choose the folder again, or ask again to replace another backup. */
function BackupStatusRow({ state, automatic, error, working, supported, onRun, onReplace }: Pick<BackupState, 'state' | 'automatic' | 'error'> & {
  working: boolean; supported: boolean; onRun(chooseDirectory: boolean): void; onReplace(): void;
}) {
  const t = useTranslation();
  const otherBackup = isCompanionFolderBackupOtherBackup(error || state?.errorMessage);
  const reselect = !otherBackup && companionBackupNeedsFolder(state, error);
  return <SettingsRow controlLayout="inline" description={<>
    <span role="status" data-settings-action-status>{companionBackupSummary(state, automatic, error, t)}</span>
    {reselect ? <span className="mt-1 block" role="alert">{t('companion.settings.storage.backupReselectHint')}</span> : null}
  </>}>
    <SettingsControlSlot><AppButton data-testid="companion-database-backup" disabled={!supported || (!state?.configured && !reselect && !otherBackup)}
      loading={working} loadingLabel={t('companion.settings.storage.backupWorking')} size="sm"
      onClick={() => { if (otherBackup) onReplace(); else onRun(reselect); }}>
      {t(otherBackup ? 'companion.settings.storage.backupReplaceAgain' : reselect ? 'companion.settings.storage.backupReselect' : 'companion.settings.storage.backupNow')}
    </AppButton></SettingsControlSlot>
  </SettingsRow>;
}

export function CompanionFolderDatabaseBackupSection() {
  const t = useTranslation();
  const presentation = getCompanionSettingsPreview();
  const supported = supportsCompanionFolderDatabaseBackup() || Boolean(presentation);
  const preview = getCompanionRuntimeCapability().kind === 'browser-preview';
  const { state, setState, error, setError, automatic, setAutomatic } = useCompanionFolderBackupState(supported);
  const [changingAutomatic, setChangingAutomatic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [replaceAsked, setReplaceAsked] = useState(0);
  async function run(chooseDirectory: boolean, replaceExisting = false) {
    setBusy(true);
    setError(null);
    try {
      const next = await requestBackup(chooseDirectory, replaceExisting);
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
        <BackupStatusRow state={state} automatic={automatic} error={error} working={working} supported={supported}
          onRun={chooseDirectory => void run(chooseDirectory)} onReplace={() => setReplaceAsked(count => count + 1)} />
      </SettingsSection>
      <CompanionBackupRestoreSection />
      <CompanionBackupLocationDialog open={locationOpen} onOpenChange={setLocationOpen} working={working}
        label={state?.directoryLabel ?? ''} onChange={() => { setLocationOpen(false); void run(true); }} />
      <CompanionBackupReplacePrompt error={error} reopen={replaceAsked} onReplace={() => void run(false, true)} onChooseOther={() => void run(true)} />
    </section>
  );
}
