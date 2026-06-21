import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

export function ExternalFolderSetupDialog(props: {
  onClose: () => void;
  onConnectFolder?: () => void;
  open: boolean;
}) {
  const t = useTranslation();
  return (
    <AppDialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{t('desktop.externalLibrary.setup.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {t('desktop.externalLibrary.setup.description')}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppDialogClose asChild>
              <AppButton variant="ghost">{t('common.cancel')}</AppButton>
            </AppDialogClose>
            {props.onConnectFolder ? (
              <AppButton onClick={() => {
                props.onClose();
                props.onConnectFolder?.();
              }}>
                {t('desktop.externalLibrary.menu.connectFolder')}
              </AppButton>
            ) : null}
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
