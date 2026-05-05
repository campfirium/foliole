export interface EditorSelection {
  from: number;
  to: number;
}

export interface EditorAdapter {
  destroy(): void;
  focus(): void;
  getContent(): string;
  setContent(content: string): void;
  getSelection(): EditorSelection;
  setSelection(selection: EditorSelection): void;
  getScrollTop(): number;
  setScrollTop(scrollTop: number): void;
  replaceSelection(content: string): void;
  onContentChange(listener: (content: string) => void): () => void;
}
