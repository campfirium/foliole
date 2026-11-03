import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppEmptyState } from '../shared/ui';
import { AppNoticeDialog } from '../shared/ui/AppNoticeDialog';
import { AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay,
  AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';

export function CompanionPdfUnavailableNotice(props: { open: boolean; onClose(): void }) {
  const t = useTranslation();
  return <AppNoticeDialog open={props.open} onOpenChange={open => !open && props.onClose()}>
    <AppDialogPortal><AppDialogOverlay /><AppDialogContent layout="notice">
      <AppDialogTitle>{t('companion.reading.pdfUnavailable.title')}</AppDialogTitle>
      <AppDialogBody className="!min-h-dialog-notice-body">
        <AppDialogDescription>{t('companion.reading.pdfUnavailable.oldWebViewText')}</AppDialogDescription>
      </AppDialogBody>
      <AppDialogActions><AppButton onClick={props.onClose}>{t('shared.close')}</AppButton></AppDialogActions>
    </AppDialogContent></AppDialogPortal>
  </AppNoticeDialog>;
}

export function CompanionPdfUnavailable(props: {
  outdated: boolean; onBack?: (() => void) | undefined; backLabel?: string | undefined;
}) {
  const t = useTranslation();
  return <section className="flex min-h-full flex-col">
    {props.onBack ? <div className="border-b border-companion-divider px-1 py-2">
      <AppButton onClick={props.onBack} variant="ghost">{props.backLabel ?? t('companion.back')}</AppButton>
    </div> : null}
    <AppEmptyState title={t('companion.reading.pdfUnavailable.title')}
      description={t(props.outdated ? 'companion.reading.pdfUnavailable.oldWebView'
        : 'companion.reading.pdfUnavailable.loadFailed')} />
  </section>;
}
