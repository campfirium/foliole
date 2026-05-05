export interface EditorSelection {
  from: number;
  to: number;
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
  setContent(content: string): void;
  getSelection(): EditorSelection;
  revealSelection(selection: EditorSelection): void;
  setSelection(selection: EditorSelection): void;
  getLineBlockHeight(lineNumber: number): number;
  getScrollTop(): number;
  setScrollTop(scrollTop: number): void;
  getScrollMetrics(): EditorScrollMetrics;
  replaceSelection(content: string): void;
  setDiffDecorations(diffDecorations: import('./lineDiffDecorations').EditorDiffDecorations | null): void;
  onContentChange(listener: (content: string) => void): () => void;
  onScroll(listener: () => void): () => void;
}
