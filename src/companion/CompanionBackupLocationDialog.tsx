import { useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isCompanionFolderBackupOtherBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupDirectoryFailure';
import { AppDialog, AppDialogTitle, AppDialogPortal } from '../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../shared/ui/SettingsTouchSheet';

export function CompanionBackupLocationDialog({ open, label, working, onOpenChange, onChange }: {
  open: boolean; label: string; working: boolean; onOpenChange(open: boolean): void; onChange(): void;
}) {
  const t = useTranslation();
  return <AppDialog open={open} onOpenChange={onOpenChange}>
    <AppDialogPortal><SettingsTouchSheetOverlay /><SettingsTouchSheet>
      <div data-settings-sheet-header>
        <AppDialogTitle>{t('companion.settings.storage.backupFolder')}</AppDialogTitle>
        <button type="button" onClick={() => onOpenChange(false)}>{t('common.done')}</button>
      </div>
      <p data-settings-sheet-caption>{t('companion.settings.storage.currentBackupFolder')}</p>
      <p data-settings-sheet-location>{label}</p>
      <button type="button" data-settings-sheet-primary disabled={working} onClick={onChange}>{t('companion.settings.storage.changeBackupFolder')}</button>
    </SettingsTouchSheet></AppDialogPortal>
  </AppDialog>;
}

/** Opens when the chosen folder holds a backup this library does not own; replacing it needs the user's word. */
export function CompanionBackupReplacePrompt({ error, onReplace, onChooseOther }: {
  error: string | null; onReplace(): void; onChooseOther(): void;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (isCompanionFolderBackupOtherBackup(error)) setOpen(true); }, [error]);
  const choose = (next: () => void) => () => { setOpen(false); next(); };
  return <AppDialog open={open} onOpenChange={setOpen}>
    <AppDialogPortal><SettingsTouchSheetOverlay /><SettingsTouchSheet>
      <div data-settings-sheet-header>
        <AppDialogTitle>{t('companion.settings.storage.backupReplaceTitle')}</AppDialogTitle>
        <button type="button" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
      </div>
      <p data-settings-sheet-location>{t('companion.settings.storage.backupReplaceDescription')}</p>
      <button type="button" data-settings-sheet-primary data-testid="companion-backup-replace" onClick={choose(onReplace)}>
        {t('companion.settings.storage.backupReplaceConfirm')}
      </button>
      <button type="button" data-settings-sheet-secondary onClick={choose(onChooseOther)}>
        {t('companion.settings.storage.backupReplaceOther')}
      </button>
    </SettingsTouchSheet></AppDialogPortal>
  </AppDialog>;
}
