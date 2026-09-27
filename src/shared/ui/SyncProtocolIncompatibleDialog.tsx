import { useTranslation } from '../localization/LocalizationProvider';

import { AppDialog, AppDialogBody, AppDialogContent,
  AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from './Dialog';

export function SyncProtocolIncompatibleDialog(props: { onClose(): void; open: boolean }) {
  const t = useTranslation();
  return (
    <AppDialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-dialog-notice" layout="task">
          <AppDialogTitle>{t('companion.sync.protocolMismatch.title')}</AppDialogTitle>
          <AppDialogBody className="!min-h-dialog-notice-body flex items-center">
            <AppDialogDescription>
              {t('companion.sync.protocolMismatch.description')}
            </AppDialogDescription>
          </AppDialogBody>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
