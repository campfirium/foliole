import { useCallback, useLayoutEffect, useRef, type RefObject, type UIEvent } from 'react';

import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import { companionPdfPageAtTextOffset, type CompanionPdfReadingContext } from '../shared/platform/companion/reading/companionPdfTextResume';
import type { CompanionPdfPageUpdate } from '../shared/platform/companion/reading/saveCompanionPdfTextPosition';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { readCompanionPdfViewportOffset, useCompanionPdfResumeOffer } from './useCompanionPdfResumeOffer';

type PdfTextScrollArgs = {
  article: CompanionReadableArticle;
  editing: boolean;
  jump?: { commandId: string | null; selection: EditorSelection | null };
  surface?: RefObject<HTMLElement | null>;
  onEditorReady: (editor: EditorAdapter | null) => void;
  onScrollTopChange?: ((scrollTop: number, pdf?: CompanionPdfPageUpdate) => void) | undefined;
};

type PdfReading = CompanionReadableArticle['pdfTextReading'];
type ScrollInput = { reading: PdfReading; until: number };

export function useCompanionPdfTextScroll(args: PdfTextScrollArgs) {
  const editor = useRef<EditorAdapter | null>(null);
  const lastInput = useRef<ScrollInput | null>(null);
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
  const onJumpSettled = usePdfJumpCompletion({ ...args, editor, lastInput, savePosition });
  return { markInput, onEditorReady, onScroll, onJumpSettled, offer, hasAccepted: () => Boolean(accepted.current && accepted.current.reading === reading) };
}

function usePdfJumpCompletion(args: PdfTextScrollArgs & {
  editor: RefObject<EditorAdapter | null>;
  lastInput: RefObject<ScrollInput | null>;
  savePosition(surface: HTMLElement, offset: number): boolean;
}) {
  const completed = useRef<{ reading: PdfReading; commandId: string; offset: number } | null>(null);
  const latest = useRef(args);
  latest.current = args;

  const complete = useCallback((selection: EditorSelection, commandId: string) => {
    const { article, editing, editor, jump, lastInput, savePosition, surface } = latest.current;
    const reading = article.pdfTextReading;
    const viewport = surface?.current;
    if (!viewport || !reading || editing || commandId !== jump?.commandId ||
        selection.from !== jump.selection?.from || editor.current?.getContent() !== article.content) return;
    const previous = completed.current;
    if (previous?.reading === reading && previous.commandId === commandId && previous.offset === selection.from) return;
    lastInput.current = null;
    if (savePosition(viewport, selection.from)) completed.current = { reading, commandId, offset: selection.from };
  }, []);

  useLayoutEffect(() => () => {
    const { article, editing, editor, jump, lastInput } = latest.current;
    if (!article.pdfTextReading || editing || !jump?.commandId || !jump.selection || !editor.current) return;
    if (lastInput.current?.reading === article.pdfTextReading && lastInput.current.until >= performance.now()) return;
    // CodeMirror may have applied the target while its completion callback is still cooling down.
    complete(editor.current.getSelection(), jump.commandId);
  }, [complete]);

  return useCallback((reason: string, selection?: EditorSelection, commandId?: string) => {
    if (reason === 'editor-restore-selection-settled' && selection && commandId) complete(selection, commandId);
  }, [complete]);
}
