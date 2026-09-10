import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

export function KeepImportDisableDialog(props: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceLabel: string;
}) {
  const t = useTranslation();
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="w-[min(480px,calc(100vw-64px))]"
          layout="task"
        >
          <AppDialogTitle className="text-base font-semibold">{t('desktop.keepImport.disable.title')}</AppDialogTitle>
          <AppDialogBody>
            <p className="text-sm text-foreground/62">{props.sourceLabel}</p>
            <p className="mt-2 text-sm text-foreground/70">{t('desktop.keepImport.disable.description')}</p>
          </AppDialogBody>
          <AppDialogActions>
              <AppButton onClick={() => props.onOpenChange(false)} variant="ghost">
                {t('desktop.keepImport.disable.cancel')}
              </AppButton>
              <AppButton onClick={props.onConfirm} variant="danger">
                {t('desktop.keepImport.disable.turnOff')}
              </AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
