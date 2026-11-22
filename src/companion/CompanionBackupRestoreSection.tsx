import type { CompanionBackupRestoreSummary } from '../../lib/platform/companionBackupRestoreContract';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { supportsCompanionBackupRestore } from '../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository';
import { AppButton, AppSpinner, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';
import { AppDialog, AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../shared/ui/SettingsTouchSheet';

import { CompanionBackupRevertRow } from './CompanionBackupRevertRow';
import { formatCompanionLibrarySize, type CompanionPreviousLibrary } from './companionPreviousLibrary';
import { formatCompanionTopicDate } from './CompanionRecentArticleList';
import { useCompanionBackupRestore, type CompanionBackupRestoreView } from './useCompanionBackupRestore';

function SummaryLine({ caption, value }: { caption: string; value: string }) {
  return <div className="mt-4">
    <p data-settings-sheet-caption>{caption}</p>
    <p data-settings-sheet-location>{value}</p>
  </div>;
}

function RestoreSummary({ summary }: { summary: CompanionBackupRestoreSummary }) {
  const { locale, t } = useLocalization();
  const attachments = [t('companion.settings.storage.restoreAttachmentsIncluded', { count: summary.stagedAttachmentCount })];
  if (summary.missingAttachmentCount) {
    attachments.push(t('companion.settings.storage.restoreAttachmentsMissing', { count: summary.missingAttachmentCount }));
  }
  if (summary.damagedFiles) attachments.push(t('companion.settings.storage.restoreAttachmentsDamaged', { count: summary.damagedFiles }));
  return <div data-testid="companion-restore-summary">
    <SummaryLine caption={t('companion.settings.storage.restoreSource')} value={summary.sourceLabel} />
    {summary.backupHostName ? <SummaryLine caption={t('companion.settings.storage.restoreMadeOn')} value={summary.backupHostName} /> : null}
    <SummaryLine caption={t('companion.settings.storage.restoreEntries')} value={String(summary.entryCount)} />
    {summary.lastModifiedAt ? <SummaryLine caption={t('companion.settings.storage.restoreLastChanged')}
      value={formatCompanionTopicDate(summary.lastModifiedAt, locale)} /> : null}
    <SummaryLine caption={t('companion.settings.storage.restoreAttachments')} value={attachments.join(' · ')} />
    <p className="mt-6" data-settings-sheet-caption role="status">{t('companion.settings.storage.restoreNothingReplaced')}</p>
  </div>;
}

type Restore = ReturnType<typeof useCompanionBackupRestore>;

/** Names the set-aside library the next swap deletes, so the user confirms with its date and size in view. */
export function CompanionPreviousLibraryWarning({ previous }: { previous: CompanionPreviousLibrary }) {
  const { locale, t } = useLocalization();
  const date = previous.savedAt ? formatCompanionTopicDate(previous.savedAt, locale) : '';
  return <p className="mt-3" data-settings-sheet-caption role="alert" data-testid="companion-restore-previous-warning">
    {t('companion.settings.storage.restoreConfirmPrevious', { date, size: formatCompanionLibrarySize(previous.bytes) })}</p>;
}

function ReplaceSteps({ view, restore }: { view: CompanionBackupRestoreView; restore: Restore }) {
  const { t } = useLocalization();
  if (view.step === 'ready') {
    return <>
      <RestoreSummary summary={view.summary} />
      <button type="button" data-settings-sheet-primary data-testid="companion-restore-replace"
        onClick={() => void restore.requestReplace(view.summary)}>{t('companion.settings.storage.restoreReplace')}</button>
    </>;
  }
  if (view.step === 'confirm') {
    return <>
      <p data-settings-sheet-location>{t('companion.settings.storage.restoreConfirmDescription')}</p>
      {view.previous ? <CompanionPreviousLibraryWarning previous={view.previous} /> : null}
      <button type="button" data-settings-sheet-primary data-testid="companion-restore-confirm"
        onClick={() => void restore.replace()}>{t('companion.settings.storage.restoreReplaceConfirm')}</button>
    </>;
  }
  if (view.step === 'replacing') {
    return <p data-settings-sheet-location role="status" className="flex items-center gap-3">
      <AppSpinner decorative size="sm" /><span>{t('companion.settings.storage.restoreReplacing')}</span>
    </p>;
  }
  if (view.step !== 'failed') return null;
  return <>
    <p data-settings-sheet-location role="alert">{view.error}</p>
    <button type="button" data-settings-sheet-primary onClick={restore.close}>{t('companion.settings.storage.restoreReopen')}</button>
  </>;
}

function RestoreSheetBody({ view, restore }: { view: CompanionBackupRestoreView; restore: Restore }) {
  const { t } = useLocalization();
  const { choose } = restore;
  if (view.step === 'reading') {
    return <p data-settings-sheet-location role="status" className="flex items-center gap-3">
      <AppSpinner decorative size="sm" />
      <span>{view.files ? t('companion.settings.storage.restoreReadingFiles', { count: view.files }) : t('companion.settings.storage.restoreReading')}</span>
    </p>;
  }
  if (view.step !== 'choose') return <ReplaceSteps view={view} restore={restore} />;
  return <>
    <p data-settings-sheet-caption>{t('companion.settings.storage.restoreChooseHint')}</p>
    {view.error ? <p data-settings-sheet-location role="alert">{view.error}</p> : null}
    <button type="button" data-settings-sheet-primary data-testid="companion-restore-zip" onClick={() => void choose('zip')}>
      {t('companion.settings.storage.restoreChooseZip')}
    </button>
    <button type="button" data-settings-sheet-secondary data-testid="companion-restore-folder" onClick={() => void choose('folder')}>
      {t('companion.settings.storage.restoreChooseFolder')}
    </button>
  </>;
}

const SHEET_TITLES: Partial<Record<CompanionBackupRestoreView['step'], Parameters<ReturnType<typeof useLocalization>['t']>[0]>> = {
  ready: 'companion.settings.storage.restoreReady',
  confirm: 'companion.settings.storage.restoreConfirmTitle'
};

export function CompanionBackupRestoreSection() {
  const { t } = useLocalization();
  const restore = useCompanionBackupRestore();
  if (!supportsCompanionBackupRestore()) return null;
  const { view } = restore;
  return <>
    <SettingsSection ariaLabel={t('companion.settings.storage.restore')}>
      <SettingsRow controlLayout="inline" title={t('companion.settings.storage.restore')} description={t('companion.settings.storage.restoreHint')}>
        <SettingsControlSlot><AppButton data-testid="companion-restore-open" onClick={restore.open} size="sm">
          {t('companion.settings.storage.restoreChoose')}
        </AppButton></SettingsControlSlot>
      </SettingsRow>
      <CompanionBackupRevertRow />
    </SettingsSection>
    <AppDialog open={view.step !== 'closed'} onOpenChange={open => { if (!open) restore.close(); }}>
      <AppDialogPortal><SettingsTouchSheetOverlay /><SettingsTouchSheet>
        <div data-settings-sheet-header>
          <AppDialogTitle>{t(SHEET_TITLES[view.step] ?? 'companion.settings.storage.restore')}</AppDialogTitle>
          {view.step === 'replacing' || view.step === 'failed' ? null : <button type="button" onClick={restore.close}>
            {t(view.step === 'reading' || view.step === 'confirm' ? 'common.cancel' : 'common.done')}</button>}
        </div>
        <RestoreSheetBody view={view} restore={restore} />
      </SettingsTouchSheet></AppDialogPortal>
    </AppDialog>
  </>;
}
