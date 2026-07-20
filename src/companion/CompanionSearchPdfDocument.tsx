import { lazy, Suspense, useCallback } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { syncCompanionAttachmentResourceFromDesktop } from '../shared/platform/companionDesktopAttachmentResources';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';

import { companionMobileRailClassName } from './companionCssCompatibility';

const SimplePdfDocument = lazy(() =>
  import('../features/pdf/components/SimplePdfDocument').then((module) => ({ default: module.SimplePdfDocument }))
);

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
      <Suspense fallback={null}>
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
