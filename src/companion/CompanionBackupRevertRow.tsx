import { useEffect, useState } from 'react';

import { useLocalization } from '../shared/localization/LocalizationProvider';
import { revertCompanionBackupRestore } from '../shared/platform/companion/backupRestore/companionBackupRestore';
import { getCompanionBackupRestorePort } from '../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository';
import { AppButton, AppSpinner, SettingsControlSlot, SettingsRow } from '../shared/ui';
import { AppDialog, AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../shared/ui/SettingsTouchSheet';

import { companionBackupRestoreMessage } from './companionBackupRestoreMessage';
import { failCompanionLibrarySwitch } from './companionLibrarySwitch';
import { formatCompanionTopicDate } from './CompanionRecentArticleList';
import { companionLibrarySwapContext, reloadCompanionApp } from './useCompanionBackupRestore';

type RevertStep = { step: 'closed' | 'confirm' | 'reverting' | 'deleteConfirm' | 'deleting' } | { step: 'failed'; error: string };

function megabytes(bytes: number) {
  return `${Math.max(1, Math.ceil(bytes / (1024 * 1024)))} MB`;
}

function DeleteSheetBody({ view, size, date, onDelete }: { view: RevertStep; size: string; date: string; onDelete(): void }) {
  const { t } = useLocalization();
  if (view.step === 'deleting') {
    return <p data-settings-sheet-location role="status" className="flex items-center gap-3">
      <AppSpinner decorative size="sm" /><span>{t('companion.settings.storage.revertDeleting')}</span>
    </p>;
  }
  return <>
    <p data-settings-sheet-location>{t('companion.settings.storage.revertDeleteDescription', { date, size })}</p>
    <button type="button" data-settings-sheet-primary data-testid="companion-revert-delete-confirm" onClick={onDelete}>
      {t('companion.settings.storage.revertDeleteConfirm')}
    </button>
  </>;
}

function RevertSheetBody({ view, onRevert }: { view: RevertStep; onRevert(): void }) {
  const { t } = useLocalization();
  if (view.step === 'reverting') {
    return <p data-settings-sheet-location role="status" className="flex items-center gap-3">
      <AppSpinner decorative size="sm" /><span>{t('companion.settings.storage.revertWorking')}</span>
    </p>;
  }
  if (view.step === 'failed') {
    return <>
      <p data-settings-sheet-location role="alert">{view.error}</p>
      <button type="button" data-settings-sheet-primary onClick={reloadCompanionApp}>{t('companion.settings.storage.restoreReopen')}</button>
    </>;
  }
  return <>
    <p data-settings-sheet-location>{t('companion.settings.storage.revertDescription')}</p>
    <button type="button" data-settings-sheet-primary data-testid="companion-revert-confirm" onClick={onRevert}>
      {t('companion.settings.storage.revertConfirm')}
    </button>
  </>;
}

/** The library a restore set aside on this phone: null while none is kept. */
function usePreviousLibrary() {
  const [previous, setPrevious] = useState<{ savedAt: string; bytes: number } | null>(null);
  useEffect(() => {
    let active = true;
    void getCompanionBackupRestorePort().previous()
      .then(value => { if (active && value.exists) setPrevious({ savedAt: value.savedAt ?? '', bytes: value.bytes ?? 0 }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return { previous, forget: () => setPrevious(null) };
}

/** Offers to put back or delete the library a restore set aside, while one is kept on this phone. */
export function CompanionBackupRevertRow() {
  const { locale, t } = useLocalization();
  const { previous, forget } = usePreviousLibrary();
  const [view, setView] = useState<RevertStep>({ step: 'closed' });
  if (previous === null) return null;

  async function revert() {
    setView({ step: 'reverting' });
    try { await revertCompanionBackupRestore(companionLibrarySwapContext()); }
    catch (error) {
      const message = companionBackupRestoreMessage(error, t);
      if (!failCompanionLibrarySwitch(message)) setView({ step: 'failed', error: message });
    }
  }
  async function remove() {
    setView({ step: 'deleting' });
    try {
      await getCompanionBackupRestorePort().deletePrevious();
      setView({ step: 'closed' });
      forget();
    } catch (error) { setView({ step: 'failed', error: companionBackupRestoreMessage(error, t) }); }
  }
  const date = previous.savedAt ? formatCompanionTopicDate(previous.savedAt, locale) : '';
  const deleting = view.step === 'deleteConfirm' || view.step === 'deleting';
  return <>
    <SettingsRow controlLayout="inline" title={t('companion.settings.storage.revert')}
      description={t('companion.settings.storage.revertHint', { date })}>
      <SettingsControlSlot className="flex gap-2">
        <AppButton data-testid="companion-revert-delete" onClick={() => setView({ step: 'deleteConfirm' })} size="sm">
          {t('companion.settings.storage.revertDelete')}
        </AppButton>
        <AppButton data-testid="companion-revert-open" onClick={() => setView({ step: 'confirm' })} size="sm">
          {t('companion.settings.storage.revertChoose')}
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
    <AppDialog open={view.step !== 'closed'} onOpenChange={open => {
      if (!open && (view.step === 'confirm' || view.step === 'deleteConfirm')) setView({ step: 'closed' });
    }}>
      <AppDialogPortal><SettingsTouchSheetOverlay /><SettingsTouchSheet>
        <div data-settings-sheet-header>
          <AppDialogTitle>{t(deleting ? 'companion.settings.storage.revertDeleteTitle' : 'companion.settings.storage.revertTitle')}</AppDialogTitle>
          {view.step === 'confirm' || view.step === 'deleteConfirm'
            ? <button type="button" onClick={() => setView({ step: 'closed' })}>{t('common.cancel')}</button> : null}
        </div>
        {deleting ? <DeleteSheetBody view={view} size={megabytes(previous.bytes)} date={date} onDelete={() => void remove()} />
          : <RevertSheetBody view={view} onRevert={() => void revert()} />}
      </SettingsTouchSheet></AppDialogPortal>
    </AppDialog>
  </>;
}
