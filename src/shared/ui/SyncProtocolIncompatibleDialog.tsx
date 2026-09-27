import { X } from 'lucide-react';

import { useTranslation } from '../localization/LocalizationProvider';

import { AppDialog, AppDialogBody, AppDialogClose, AppDialogContent,
  AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from './Dialog';

export function SyncProtocolIncompatibleDialog(props: { onClose(): void; open: boolean }) {
  const t = useTranslation();
  return (
    <AppDialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))]" layout="task">
          <AppDialogTitle>{t('companion.sync.protocolMismatch.title')}</AppDialogTitle>
          <AppDialogClose asChild>
            <button aria-label={t('shared.close')}
              className="absolute right-4 top-3 inline-flex size-8 items-center justify-center rounded-md text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
              type="button">
              <X aria-hidden="true" size={16} />
            </button>
          </AppDialogClose>
          <AppDialogBody>
            <AppDialogDescription>{t('companion.sync.protocolMismatch.description')}</AppDialogDescription>
          </AppDialogBody>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
