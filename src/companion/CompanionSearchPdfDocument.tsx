import { lazy, Suspense, useCallback } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { syncCompanionAttachmentResourceFromDesktop } from '../shared/platform/companionDesktopAttachmentResources';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';
import { AppButton, AppLoadingState } from '../shared/ui';

import { companionMobileRailClassName } from './companionCssCompatibility';

const SimplePdfDocument = lazy(() =>
  import('../features/pdf/components/SimplePdfDocument').then((module) => ({ default: module.SimplePdfDocument }))
);

export function CompanionSearchPdfLoadingState(props: { onExit(): void }) {
  const t = useTranslation();
  return (
    <div className="flex min-h-full flex-col bg-companion-base">
      <div className="border-b border-companion-divider bg-companion-surface px-1 py-2">
        <AppButton onClick={props.onExit} variant="ghost">{t('companion.back')}</AppButton>
      </div>
      <AppLoadingState
        className="flex-1"
        description={t('desktop.pdf.simple.preparing.syncedFile')}
        title={t('desktop.pdf.simple.preparing.title')}
      />
    </div>
  );
}

export function CompanionSearchPdfDocument(props: {
  onExit(): void;
  result: CompanionPdfPageTextSearchResult;
  syncEndpointUrl: string | null;
}) {
  const t = useTranslation();
  const syncMissingResource = useCallback(async (attachmentId: string) => {
    if (!props.syncEndpointUrl) return;
    await syncCompanionAttachmentResourceFromDesktop(props.syncEndpointUrl, attachmentId);
  }, [props.syncEndpointUrl]);
  return (
    <section className={`fixed top-0 right-0 bottom-0 left-0 z-surface-raised overflow-hidden bg-companion-base ${companionMobileRailClassName} pt-[env(safe-area-inset-top)] text-foreground`}>
      <Suspense fallback={<CompanionSearchPdfLoadingState onExit={props.onExit} />}>
        <SimplePdfDocument
          attachmentId={props.result.attachment_id}
          backLabel={t('companion.back')}
          initialPage={props.result.page}
          onBackToText={props.onExit}
          onMissingResource={syncMissingResource}
          title={t('companion.search.pdfPage', { page: props.result.page })}
        />
      </Suspense>
    </section>
  );
}
