export interface EditorSelection {
  from: number;
  to: number;
}

export interface EditorSearchDecorations {
  activeIndex: number;
  matches: EditorSelection[];
}

export interface EditorTextAnchorDecoration {
  from: number;
  kind: 'cloze' | 'highlight';
  to: number;
}

export interface EditorInlineAnchorCompatibility {
  hiddenKeys: readonly string[];
}

export interface EditorTextAnchorPresentation {
  inlineAnchorCompatibility: EditorInlineAnchorCompatibility;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}

export const EMPTY_EDITOR_TEXT_ANCHOR_PRESENTATION: EditorTextAnchorPresentation = {
  inlineAnchorCompatibility: {
    hiddenKeys: []
  },
  textAnchorDecorations: []
};

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
  getPrimaryVisiblePosition?(): number | null;
  isPositionNearViewportRatio?(position: number, ratio: number, toleranceRatio?: number): boolean;
  getViewportRect?(): DOMRect | null;
  revealPosition(position: number): void;
  revealSelectionAtViewportRatio?(selection: EditorSelection, ratio: number): void;
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
  setTextAnchorPresentation?(textAnchorPresentation: EditorTextAnchorPresentation): void;
  setReadOnly?(readOnly: boolean): void;
  setDiffDecorations(diffDecorations: import('./lineDiffDecorations').EditorDiffDecorations | null): void;
  setSearchDecorations(searchDecorations: EditorSearchDecorations | null): void;
  onContentChange(listener: (content: string) => void): () => void;
  onScroll(listener: () => void): () => void;
}
