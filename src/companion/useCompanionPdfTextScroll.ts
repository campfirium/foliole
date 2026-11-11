import { useCallback, useRef, type UIEvent } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import type { CompanionPdfPageUpdate } from '../shared/platform/companion/reading/saveCompanionPdfTextPosition';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

export function useCompanionPdfTextScroll(args: {
  article: CompanionReadableArticle;
  editing: boolean;
  onEditorReady: (editor: EditorAdapter | null) => void;
  onScrollTopChange?: ((scrollTop: number, pdf?: CompanionPdfPageUpdate) => void) | undefined;
}) {
  const editor = useRef<EditorAdapter | null>(null);
  const lastInput = useRef<{ reading: CompanionReadableArticle['pdfTextReading']; until: number } | null>(null);
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
        lastInput.current.until < performance.now() || editor.current?.getContent() !== article.content) return false;
    const bounds = surface.getBoundingClientRect();
    const offset = editor.current.getDocumentPositionAtViewportY(bounds.top + bounds.height * 0.12);
    if (offset === null) return false;
    let page = position.starts[0]!.page;
    for (const row of position.starts) {
      if (row.start > offset) break;
      page = row.page;
    }
    onScrollTopChange(surface.scrollTop, { nodeId: article.nodeId, context: position.context, page });
    return true;
  };
  return { markInput, onEditorReady, onScroll };
}
