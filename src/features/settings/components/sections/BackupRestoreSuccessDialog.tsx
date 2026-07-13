import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../../../shared/ui';
export function BackupRestoreSuccessDialog(props: { fileName: string; onClose: () => void }) {
  const t = useTranslation();

  return (
    <AppDialog open={props.fileName.length > 0} onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{t('settings.backups.restore.success.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-3">
            {t('settings.backups.restore.success.description', { fileName: props.fileName })}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end">
            <AppButton onClick={props.onClose}>{t('settings.backups.restore.success.done')}</AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
