import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppDialog, AppDialogTitle, AppDialogPortal, AppDialogOverlay } from '../shared/ui/Dialog';
import { SettingsTouchSheet } from '../shared/ui/SettingsTouchSheet';

export function CompanionBackupLocationDialog({ open, label, working, onOpenChange, onForget, onChange }: {
  open: boolean; label: string; working: boolean; onOpenChange(open: boolean): void; onForget(): void; onChange(): void;
}) {
  const t = useTranslation();
  return <AppDialog open={open} onOpenChange={onOpenChange}>
    <AppDialogPortal><AppDialogOverlay /><SettingsTouchSheet>
      <div data-settings-sheet-header>
        <AppDialogTitle>{t('companion.settings.storage.backupFolder')}</AppDialogTitle>
        <button type="button" onClick={() => onOpenChange(false)}>{t('common.done')}</button>
      </div>
      <p data-settings-sheet-caption>{t('companion.settings.storage.currentBackupFolder')}</p>
      <p data-settings-sheet-location>{label}</p>
      <button type="button" data-settings-sheet-primary disabled={working} onClick={onChange}>{t('companion.settings.storage.changeBackupFolder')}</button>
      <button type="button" data-settings-sheet-secondary disabled={working} onClick={onForget}>{t('companion.settings.storage.forgetBackupFolder')}</button>
    </SettingsTouchSheet></AppDialogPortal>
  </AppDialog>;
}
