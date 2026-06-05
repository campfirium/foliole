import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppSpinner } from '../../shared/ui';

export function PdfDocumentLoadingOverlay() {
  const t = useTranslation();

  return (
    <div
      aria-busy="true"
      aria-label={t('desktop.pdf.pageProgress')}
      className="pointer-events-none absolute inset-0 z-workspace-overlay flex items-center justify-center"
      data-testid="pdf-document-loading-overlay"
      role="status"
    >
      <AppSpinner decorative size="lg" />
    </div>
  );
}
