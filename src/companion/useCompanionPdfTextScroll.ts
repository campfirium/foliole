import { useCallback, useRef, type RefObject, type UIEvent } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { companionPdfPageAtTextOffset, type CompanionPdfReadingContext } from '../shared/platform/companion/reading/companionPdfTextResume';
import type { CompanionPdfPageUpdate } from '../shared/platform/companion/reading/saveCompanionPdfTextPosition';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { readCompanionPdfViewportOffset, useCompanionPdfResumeOffer } from './useCompanionPdfResumeOffer';

export function useCompanionPdfTextScroll(args: {
  article: CompanionReadableArticle;
  editing: boolean;
  surface?: RefObject<HTMLElement | null>;
  onEditorReady: (editor: EditorAdapter | null) => void;
  onScrollTopChange?: ((scrollTop: number, pdf?: CompanionPdfPageUpdate) => void) | undefined;
}) {
  const editor = useRef<EditorAdapter | null>(null);
  const lastInput = useRef<{ reading: CompanionReadableArticle['pdfTextReading']; until: number } | null>(null);
  const accepted = useRef<{ reading: CompanionReadableArticle['pdfTextReading']; context: CompanionPdfReadingContext } | null>(null);
  const reading = args.article.pdfTextReading;
  const acceptContext = useCallback((context: CompanionPdfReadingContext) => {
    lastInput.current = null;
    accepted.current = { reading, context };
  }, [reading]);
  const offer = useCompanionPdfResumeOffer({ ...args, editor, acceptContext });
  const onEditorReady = useCallback((adapter: EditorAdapter | null) => {
    editor.current = adapter;
    args.onEditorReady(adapter);
  }, [args.onEditorReady]);
  const markInput = () => {
    if (args.article.pdfTextReading && !args.editing) {
      lastInput.current = { reading: args.article.pdfTextReading, until: performance.now() + 500 };
    }
  };
  const onScroll = (event: UIEvent<HTMLElement>) => {
    const { article, onScrollTopChange } = args;
    const surface = event.currentTarget;
    const position = article.pdfTextReading;
    if (!onScrollTopChange || !position || args.editing || lastInput.current?.reading !== position ||
        lastInput.current.until < performance.now()) return false;
    const offset = readCompanionPdfViewportOffset(editor.current, surface, article.content);
    if (offset === null) return false;
    const page = companionPdfPageAtTextOffset(position.starts, offset);
    if (page === undefined) return false;
    if (offer && page >= offer.page) offer.dismiss();
    const acceptedPosition = accepted.current;
    const context = acceptedPosition && acceptedPosition.reading === position ? acceptedPosition.context : position.context;
    onScrollTopChange(surface.scrollTop, { nodeId: article.nodeId, context, page, textOffset: offset });
    return true;
  };
  return { markInput, onEditorReady, onScroll, offer, hasAccepted: () => Boolean(accepted.current && accepted.current.reading === reading) };
}
