export interface EditorSelection {
  from: number;
  to: number;
}

export interface EditorSearchDecorations {
  activeIndex: number;
  matches: EditorSelection[];
}

export interface EditorScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export type { EditorDiffDecorations } from './lineDiffDecorations';

export interface EditorAdapter {
  destroy(): void;
  focus(): void;
  getContent(): string;
  getDocumentPositionAtViewportY(clientY: number): number | null;
  revealPosition(position: number): void;
  setParagraphMarker?(selection: EditorSelection | null): void;
  restoreSelection(selection: EditorSelection): void;
  setContent(content: string): void;
  getSelection(): EditorSelection;
  getSelectionRanges(): EditorSelection[];
  revealSelection(selection: EditorSelection): void;
  setSelection(selection: EditorSelection): void;
  setSelectionRanges(selections: EditorSelection[]): void;
  getLineBlockHeight(lineNumber: number): number;
  getScrollTop(): number;
  setScrollTop(scrollTop: number): void;
  getScrollMetrics(): EditorScrollMetrics;
  replaceRange(from: number, to: number, content: string): void;
  replaceSelection(content: string): void;
  setHiddenTextAnchorKeys?(hiddenTextAnchorKeys: readonly string[]): void;
  setReadOnly?(readOnly: boolean): void;
  setDiffDecorations(diffDecorations: import('./lineDiffDecorations').EditorDiffDecorations | null): void;
  setSearchDecorations(searchDecorations: EditorSearchDecorations | null): void;
  onContentChange(listener: (content: string) => void): () => void;
  onScroll(listener: () => void): () => void;
}
