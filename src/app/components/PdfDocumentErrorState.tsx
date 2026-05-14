import { AppButton, AppErrorState } from '../../shared/ui';

export function PdfDocumentErrorState({ loadError, onRetry }: { loadError: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[360px] w-full items-center justify-center px-6" data-testid="pdf-document-load-error">
      <AppErrorState
        action={
          <AppButton onClick={onRetry} size="sm">
            Retry
          </AppButton>
        }
        description={loadError}
        title="PDF preview unavailable"
      />
    </div>
  );
}
