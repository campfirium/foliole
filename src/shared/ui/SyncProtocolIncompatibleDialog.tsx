import { useTranslation } from '../localization/LocalizationProvider';

import { AppDialog, AppDialogActions, AppDialogBody, AppDialogContent,
  AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from './Dialog';

export function SyncProtocolIncompatibleDialog(props: { onClose(): void; open: boolean }) {
  const t = useTranslation();
  return (
    <AppDialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))]" layout="task">
          <AppDialogTitle>{t('companion.sync.protocolMismatch.title')}</AppDialogTitle>
          <AppDialogBody>
            <AppDialogDescription>{t('companion.sync.protocolMismatch.description')}</AppDialogDescription>
          </AppDialogBody>
          <AppDialogActions>
            <button className="rounded-md px-4 py-2 text-sm font-medium text-foreground"
              onClick={props.onClose} type="button">
              {t('companion.sync.protocolMismatch.close')}
            </button>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
