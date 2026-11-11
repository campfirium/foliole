import { useEffect, useState, type RefObject } from 'react';

import { decodePdfReadingPosition } from '../../lib/platform/pdfReadingPosition';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { companionPdfPageAtTextOffset, refreshCompanionPdfReadingContext,
  type CompanionPdfReadingContext } from '../shared/platform/companion/reading/companionPdfTextResume';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { subscribeCompanionReadingResumeApplied } from '../shared/platform/companion/sync/companionSyncApplied';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { logRuntimeWarning } from '../shared/platform/runtimeLogging';

type Reading = NonNullable<CompanionReadableArticle['pdfTextReading']>;
type Offer = { reading: Reading; page: number; accept(): void };

export function readCompanionPdfViewportOffset(editor: EditorAdapter | null, viewport: HTMLElement, content: string) {
  if (editor?.getContent() !== content) return null;
  const bounds = viewport.getBoundingClientRect();
  return editor.getDocumentPositionAtViewportY(bounds.top + bounds.height * 0.12);
}

export function useCompanionPdfResumeOffer(args: {
  article: CompanionReadableArticle;
  editing: boolean;
  editor: RefObject<EditorAdapter | null>;
  surface?: RefObject<HTMLElement | null> | undefined;
  acceptContext(context: CompanionPdfReadingContext): void;
}) {
  const { article: { nodeId, content, pdfTextReading: reading }, editing, editor, surface, acceptContext } = args;
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    setOffer(null);
    if (!reading || editing || !surface) return;
    const scope = getCompanionReadingScope();
    let current = true;
    let revision = 0;
    let offeredPage: number | undefined;
    let candidate: { page: number; context: CompanionPdfReadingContext } | undefined;
    const currentPage = () => {
      const offset = surface.current && readCompanionPdfViewportOffset(editor.current, surface.current, content);
      return offset == null ? undefined : companionPdfPageAtTextOffset(reading.starts, offset);
    };
    const refresh = async () => {
      const request = ++revision;
      const context = await refreshCompanionPdfReadingContext(nodeId, reading.context);
      if (!current || scope !== getCompanionReadingScope() || request !== revision) return;
      const page = context.offset === null ? undefined : decodePdfReadingPosition(context.offset).page;
      const target = reading.starts.find(row => row.page === page);
      const visible = currentPage();
      const observed = reading.context.offset;
      if (!target || visible === undefined || target.page <= visible ||
          (observed !== null && target.page === decodePdfReadingPosition(observed).page)) {
        candidate = undefined;
        setOffer(null);
        return;
      }
      candidate = { page: target.page, context };
      if (target.page === offeredPage) return;
      offeredPage = target.page;
      setOffer({ reading, page: target.page, accept: () => {
        if (!current || scope !== getCompanionReadingScope() || candidate?.page !== target.page) return;
        setOffer(null);
        const at = currentPage();
        const adapter = editor.current;
        if (at === undefined || at >= target.page || !adapter?.revealReadingPosition) return;
        acceptContext(candidate.context);
        adapter.revealReadingPosition(target.start);
      } });
    };
    const unsubscribe = subscribeCompanionReadingResumeApplied(id => {
      if (id === nodeId) void refresh().catch(error => logRuntimeWarning('PDF reading resume lookup failed', {
        area: 'persistence', action: 'offer_companion_pdf_reading_resume', error
      }));
    });
    return () => { current = false; unsubscribe(); };
  }, [nodeId, content, reading, editing, editor, surface, acceptContext]);

  return !editing && offer && offer.reading === reading ? { ...offer, dismiss: () => setOffer(null) } : null;
}
