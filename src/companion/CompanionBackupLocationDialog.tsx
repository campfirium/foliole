import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';
import { AppDialog, AppDialogContent, AppDialogTitle, AppDialogPortal, AppDialogOverlay } from '../shared/ui/Dialog';

export function CompanionBackupLocationDialog({ open, label, working, onOpenChange, onForget, onChange }: {
  open: boolean; label: string; working: boolean; onOpenChange(open: boolean): void; onForget(): void; onChange(): void;
}) {
  const t = useTranslation();
  return <AppDialog open={open} onOpenChange={onOpenChange}>
    <AppDialogPortal><AppDialogOverlay /><AppDialogContent className="w-[calc(100vw-3rem)] max-w-[420px] p-5">
      <AppDialogTitle>{t('companion.settings.storage.backupFolder')}</AppDialogTitle>
      <p className="my-5 break-all text-sm">{label}</p>
      <div className="flex flex-wrap justify-end gap-3">
        <AppButton disabled={working} size="sm" onClick={onForget}>{t('companion.settings.storage.forgetBackupFolder')}</AppButton>
        <AppButton disabled={working} size="sm" onClick={onChange}>{t('companion.settings.storage.changeBackupFolder')}</AppButton>
        <AppButton size="sm" onClick={() => onOpenChange(false)}>{t('common.done')}</AppButton>
      </div>
    </AppDialogContent></AppDialogPortal>
  </AppDialog>;
}
