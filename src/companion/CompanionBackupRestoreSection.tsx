import type { CompanionBackupRestoreSummary } from '../../lib/platform/companionBackupRestoreContract';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { supportsCompanionBackupRestore } from '../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository';
import { AppButton, AppSpinner, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';
import { AppDialog, AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../shared/ui/SettingsTouchSheet';

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

function RestoreSheetBody({ view, choose }: { view: CompanionBackupRestoreView; choose: ReturnType<typeof useCompanionBackupRestore>['choose'] }) {
  const { t } = useLocalization();
  if (view.step === 'reading') {
    return <p data-settings-sheet-location role="status" className="flex items-center gap-3">
      <AppSpinner decorative size="sm" />
      <span>{view.files ? t('companion.settings.storage.restoreReadingFiles', { count: view.files }) : t('companion.settings.storage.restoreReading')}</span>
    </p>;
  }
  if (view.step === 'ready') return <RestoreSummary summary={view.summary} />;
  return <>
    <p data-settings-sheet-caption>{t('companion.settings.storage.restoreChooseHint')}</p>
    {view.step === 'choose' && view.error ? <p data-settings-sheet-location role="alert">{view.error}</p> : null}
    <button type="button" data-settings-sheet-primary data-testid="companion-restore-zip" onClick={() => void choose('zip')}>
      {t('companion.settings.storage.restoreChooseZip')}
    </button>
    <button type="button" data-settings-sheet-secondary data-testid="companion-restore-folder" onClick={() => void choose('folder')}>
      {t('companion.settings.storage.restoreChooseFolder')}
    </button>
  </>;
}

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
    </SettingsSection>
    <AppDialog open={view.step !== 'closed'} onOpenChange={open => { if (!open) restore.close(); }}>
      <AppDialogPortal><SettingsTouchSheetOverlay /><SettingsTouchSheet>
        <div data-settings-sheet-header>
          <AppDialogTitle>{t(view.step === 'ready' ? 'companion.settings.storage.restoreReady' : 'companion.settings.storage.restore')}</AppDialogTitle>
          <button type="button" onClick={restore.close}>{t(view.step === 'reading' ? 'common.cancel' : 'common.done')}</button>
        </div>
        <RestoreSheetBody view={view} choose={restore.choose} />
      </SettingsTouchSheet></AppDialogPortal>
    </AppDialog>
  </>;
}
