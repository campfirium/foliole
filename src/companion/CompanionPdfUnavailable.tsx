import { useTranslation } from '../shared/localization/LocalizationProvider';
import { getChromiumMajorVersion, PDF_ORIGINAL_MINIMUM_CHROMIUM } from '../shared/platform/runtime/pdfOriginalSupport';
import { AppButton, AppEmptyState } from '../shared/ui';
import { AppNoticeDialog } from '../shared/ui/AppNoticeDialog';
import { AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay,
  AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';

function PdfWebViewUpdateHelp() {
  const t = useTranslation();
  return <details className="mt-3 text-sm">
    <summary className="cursor-pointer py-2">{t('companion.reading.pdfUnavailable.updateHelp')}</summary>
    <p className="mt-2">{t('companion.reading.pdfUnavailable.updateSteps')}</p>
  </details>;
}

function usePdfWebViewRequirement() {
  const t = useTranslation();
  return t('companion.reading.pdfUnavailable.versionRequirement', {
    current: getChromiumMajorVersion() ?? '—',
    minimum: PDF_ORIGINAL_MINIMUM_CHROMIUM
  });
}

export function CompanionPdfUnavailableNotice(props: { open: boolean; onClose(): void }) {
  const t = useTranslation();
  const requirement = usePdfWebViewRequirement();
  return <AppNoticeDialog open={props.open} onOpenChange={open => !open && props.onClose()}>
    <AppDialogPortal><AppDialogOverlay /><AppDialogContent layout="notice">
      <AppDialogTitle>{t('companion.reading.pdfUnavailable.title')}</AppDialogTitle>
      <AppDialogBody className="!min-h-dialog-notice-body">
        <AppDialogDescription>{requirement} {t('companion.reading.pdfUnavailable.extractedText')}</AppDialogDescription>
        <PdfWebViewUpdateHelp />
      </AppDialogBody>
      <AppDialogActions><AppButton onClick={props.onClose}>{t('shared.close')}</AppButton></AppDialogActions>
    </AppDialogContent></AppDialogPortal>
  </AppNoticeDialog>;
}

export function CompanionPdfUnavailable(props: {
  outdated: boolean; onBack?: (() => void) | undefined; backLabel?: string | undefined;
}) {
  const t = useTranslation();
  const requirement = usePdfWebViewRequirement();
  return <section className="flex min-h-full flex-col">
    {props.onBack ? <div className="border-b border-companion-divider px-1 py-2">
      <AppButton onClick={props.onBack} variant="ghost">{props.backLabel ?? t('companion.back')}</AppButton>
    </div> : null}
    <AppEmptyState title={t('companion.reading.pdfUnavailable.title')}
      description={props.outdated ? requirement : t('companion.reading.pdfUnavailable.loadFailed')} />
    {props.outdated ? <div className="mx-auto max-w-md px-4 pb-4"><PdfWebViewUpdateHelp /></div> : null}
  </section>;
}
