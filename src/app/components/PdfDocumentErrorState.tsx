import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppErrorState } from '../../shared/ui';

export function PdfDocumentErrorState({ loadError, onRetry }: { loadError: string; onRetry: () => void }) {
  const t = useTranslation();
  return (
    <div className="flex min-h-[360px] w-full items-center justify-center px-6" data-testid="pdf-document-load-error">
      <AppErrorState
        action={
          <AppButton onClick={onRetry} size="sm">
            {t('desktop.pdf.retry')}
          </AppButton>
        }
        description={loadError}
        title={t('desktop.pdf.previewUnavailable')}
      />
    </div>
  );
}
