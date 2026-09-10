import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
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
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))]" layout="task">
          <AppDialogTitle>{t('desktop.externalLibrary.setup.title')}</AppDialogTitle>
          <AppDialogBody><AppDialogDescription>{t('desktop.externalLibrary.setup.description')}</AppDialogDescription></AppDialogBody>
          <AppDialogActions>
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
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
