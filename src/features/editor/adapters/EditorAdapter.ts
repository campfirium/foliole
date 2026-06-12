export interface EditorSelection {
  from: number;
  to: number;
}

export type EditorViewportMode = 'center' | 'nearest';

export interface EditorRevealOptions {
  preserveFocus?: boolean;
}

export interface EditorContentChangeMeta {
  contentLength?: number;
  nodeId: string | null;
}

export interface EditorSearchDecorations {
  activeIndex: number;
  matches: EditorSelection[];
}

export interface EditorTextAnchorDecoration {
  from: number;
  kind: 'cloze' | 'highlight';
  nodeId?: string;
  to: number;
}

export type EditorMissingAttachmentResourceHandler = (attachmentId: string) => Promise<void> | void;

export const EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS: readonly EditorTextAnchorDecoration[] = [];

export interface EditorScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export interface EditorScrollEvent {
  userInitiated: boolean;
}

export type { EditorDiffDecorations } from './lineDiffDecorations';

export interface EditorAdapter {
  destroy(): void;
  focus(): void;
  getContent(): string;
  getDocumentPositionAtViewportY(clientY: number): number | null;
  getDocumentPositionAtClientPoint?(clientX: number, clientY: number): number | null;
  getPrimaryVisiblePosition?(): number | null;
  getPositionClientRect?(position: number): DOMRect | null;
  getPositionViewportTop?(position: number): number | null;
  isPositionNearViewportRatio?(position: number, ratio: number, toleranceRatio?: number): boolean;
  getViewportRect?(): DOMRect | null;
  revealPosition(position: number): void;
  revealSelectionCentered?(selection: EditorSelection, options?: EditorRevealOptions): void;
  revealSelectionNearest?(selection: EditorSelection, options?: EditorRevealOptions): void;
  revealSelectionAtViewportRatio?(selection: EditorSelection, ratio: number, options?: EditorRevealOptions): void;
  setParagraphMarker?(selection: EditorSelection | null): void;
  restoreSelection(selection: EditorSelection, options?: EditorRevealOptions): void;
  setContent(content: string): void;
  getSelection(): EditorSelection;
  getSelectionRanges(): EditorSelection[];
  revealSelection(selection: EditorSelection, options?: EditorRevealOptions): void;
  setSelection(selection: EditorSelection): void;
  setSelectionRanges(selections: EditorSelection[]): void;
  getLineBlockHeight(lineNumber: number): number;
  getScrollTop(): number;
  setScrollTop(scrollTop: number): void;
  getScrollMetrics(): EditorScrollMetrics;
  replaceRange(from: number, to: number, content: string): void;
  replaceSelection(content: string): void;
  setTextAnchorDecorations?(textAnchorDecorations: readonly EditorTextAnchorDecoration[]): void;
  setHighlightRangePreview?(nodeId: string, range: EditorSelection | null): void;
  setReadOnly?(readOnly: boolean): void;
  setDiffDecorations(diffDecorations: import('./lineDiffDecorations').EditorDiffDecorations | null): void;
  setSearchDecorations(searchDecorations: EditorSearchDecorations | null): void;
  onContentChange(listener: (content: string, meta?: EditorContentChangeMeta) => void): () => void;
  onScroll(listener: (event: EditorScrollEvent) => void): () => void;
}
