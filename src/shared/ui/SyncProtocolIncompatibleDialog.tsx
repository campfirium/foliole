import { useTranslation } from '../localization/LocalizationProvider';

import { AppNoticeDialog } from './AppNoticeDialog';
import { AppDialogBody, AppDialogContent,
  AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from './Dialog';

export function SyncProtocolIncompatibleDialog(props: { onClose(): void; open: boolean }) {
  const t = useTranslation();
  return (
    <AppNoticeDialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="notice">
          <AppDialogTitle>{t('companion.sync.protocolMismatch.title')}</AppDialogTitle>
          <AppDialogBody className="!min-h-dialog-notice-body">
            <AppDialogDescription>
              {t('companion.sync.protocolMismatch.description')}
            </AppDialogDescription>
          </AppDialogBody>
        </AppDialogContent>
      </AppDialogPortal>
    </AppNoticeDialog>
  );
}
