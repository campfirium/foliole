import { useCallback, useRef, type RefObject, type UIEvent } from 'react';

import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import { companionPdfPageAtTextOffset, type CompanionPdfReadingContext } from '../shared/platform/companion/reading/companionPdfTextResume';
import type { CompanionPdfPageUpdate } from '../shared/platform/companion/reading/saveCompanionPdfTextPosition';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { readCompanionPdfViewportOffset, useCompanionPdfResumeOffer } from './useCompanionPdfResumeOffer';

export function useCompanionPdfTextScroll(args: {
  article: CompanionReadableArticle;
  editing: boolean;
  jump?: { commandId: string | null; selection: EditorSelection | null };
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
    if (!reading || args.editing) return;
    lastInput.current = { reading, until: performance.now() + 500 };
  };
  const savePosition = (surface: HTMLElement, offset: number) => {
    const { article, onScrollTopChange } = args;
    if (!onScrollTopChange || !reading) return false;
    const page = companionPdfPageAtTextOffset(reading.starts, offset);
    if (page === undefined) return false;
    if (offer && page >= offer.page) offer.dismiss();
    const context = accepted.current?.reading === reading ? accepted.current.context : reading.context;
    onScrollTopChange(surface.scrollTop, { nodeId: article.nodeId, context, page, textOffset: offset });
    return true;
  };
  const onScroll = (event: UIEvent<HTMLElement>) => {
    if (!reading || args.editing || lastInput.current?.reading !== reading ||
        lastInput.current.until < performance.now()) return false;
    const surface = event.currentTarget;
    const offset = readCompanionPdfViewportOffset(editor.current, surface, args.article.content);
    return offset !== null && savePosition(surface, offset);
  };
  const completed = useRef<{ reading: typeof reading; commandId: string; offset: number } | null>(null);
  const completeJump = useRef<(selection: EditorSelection, commandId: string) => void>(() => {});
  completeJump.current = (selection, commandId) => {
    const surface = args.surface?.current;
    if (!surface || !reading || args.editing || commandId !== args.jump?.commandId ||
        selection.from !== args.jump.selection?.from ||
        editor.current?.getContent() !== args.article.content) return;
    const previous = completed.current;
    if (previous?.reading === reading && previous.commandId === commandId && previous.offset === selection.from) return;
    lastInput.current = null;
    if (savePosition(surface, selection.from)) completed.current = { reading, commandId, offset: selection.from };
  };
  const onJumpSettled = useCallback((reason: string, selection?: EditorSelection, commandId?: string) => {
    if (reason !== 'editor-restore-selection-settled' || !selection || !commandId) return;
    completeJump.current(selection, commandId);
  }, []);
  return { markInput, onEditorReady, onScroll, onJumpSettled, offer, hasAccepted: () => Boolean(accepted.current && accepted.current.reading === reading) };
}
