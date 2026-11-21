import { useEffect, useState } from 'react';

import { useLocalization } from '../shared/localization/LocalizationProvider';
import { revertCompanionBackupRestore } from '../shared/platform/companion/backupRestore/companionBackupRestore';
import { getCompanionBackupRestorePort } from '../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository';
import { AppButton, AppSpinner, SettingsControlSlot, SettingsRow } from '../shared/ui';
import { AppDialog, AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../shared/ui/SettingsTouchSheet';

import { companionBackupRestoreMessage } from './companionBackupRestoreMessage';
import { formatCompanionTopicDate } from './CompanionRecentArticleList';
import { companionLibrarySwapContext, reloadCompanionApp } from './useCompanionBackupRestore';

type RevertStep = { step: 'closed' | 'confirm' | 'reverting' } | { step: 'failed'; error: string };

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

/** Offers to put back the library a restore set aside, while one is kept on this phone. */
export function CompanionBackupRevertRow() {
  const { locale, t } = useLocalization();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [view, setView] = useState<RevertStep>({ step: 'closed' });
  useEffect(() => {
    let active = true;
    void getCompanionBackupRestorePort().previous()
      .then(previous => { if (active && previous.exists) setSavedAt(previous.savedAt ?? ''); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  if (savedAt === null) return null;

  async function revert() {
    setView({ step: 'reverting' });
    try { await revertCompanionBackupRestore(companionLibrarySwapContext()); }
    catch (error) { setView({ step: 'failed', error: companionBackupRestoreMessage(error, t) }); }
  }
  const date = savedAt ? formatCompanionTopicDate(savedAt, locale) : '';
  return <>
    <SettingsRow controlLayout="inline" title={t('companion.settings.storage.revert')}
      description={t('companion.settings.storage.revertHint', { date })}>
      <SettingsControlSlot><AppButton data-testid="companion-revert-open" onClick={() => setView({ step: 'confirm' })} size="sm">
        {t('companion.settings.storage.revertChoose')}
      </AppButton></SettingsControlSlot>
    </SettingsRow>
    <AppDialog open={view.step !== 'closed'} onOpenChange={open => { if (!open && view.step === 'confirm') setView({ step: 'closed' }); }}>
      <AppDialogPortal><SettingsTouchSheetOverlay /><SettingsTouchSheet>
        <div data-settings-sheet-header>
          <AppDialogTitle>{t('companion.settings.storage.revertTitle')}</AppDialogTitle>
          {view.step === 'confirm' ? <button type="button" onClick={() => setView({ step: 'closed' })}>{t('common.cancel')}</button> : null}
        </div>
        <RevertSheetBody view={view} onRevert={() => void revert()} />
      </SettingsTouchSheet></AppDialogPortal>
    </AppDialog>
  </>;
}
