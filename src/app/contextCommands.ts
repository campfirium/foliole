import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';

export type CommandMarkupType = 'cloze' | 'highlight';

export interface SelectionCommandPayload {
  parentNodeId: string;
  promptContent: string;
  selectionText: string;
}

export function normalizeContextMenuPosition(left: number, top: number) {
  const menuWidth = 200;
  const menuHeight = 110;
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - menuWidth)),
    top: Math.max(8, Math.min(top, window.innerHeight - menuHeight))
  };
}

export function getSelectionCommandPayload(
  parentNodeId: string,
  adapter: EditorAdapter | null
): SelectionCommandPayload | null {
  if (!adapter) {
    return null;
  }

  const content = adapter.getContent();
  const selection = adapter.getSelection();
  const max = content.length;
  const from = Math.max(0, Math.min(selection.from, selection.to, max));
  const to = Math.max(0, Math.min(Math.max(selection.from, selection.to), max));

  if (from === to) {
    return null;
  }

  const selectionText = content.slice(from, to).trim();
  if (!selectionText) {
    return null;
  }

  const lineStart = content.lastIndexOf('\n', from - 1) + 1;
  const lineEndIndex = content.indexOf('\n', to);
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
  const lineContent = content.slice(lineStart, lineEnd);
  const localFrom = from - lineStart;
  const localTo = to - lineStart;
  const promptContent = `${lineContent.slice(0, localFrom)}[[...]]${lineContent.slice(localTo)}`.trim() || '[[...]]';

  return {
    parentNodeId,
    promptContent,
    selectionText
  };
}

export function applySelectionMarkup(adapter: EditorAdapter | null, markupType: CommandMarkupType) {
  if (!adapter) {
    return false;
  }

  const selection = adapter.getSelection();
  if (selection.from === selection.to) {
    return false;
  }

  const marker = markupType === 'highlight' ? ['==', '=='] : ['{{', '}}'];
  const selectedText = adapter.getContent().slice(selection.from, selection.to);
  if (!selectedText.trim()) {
    return false;
  }

  adapter.replaceSelection(`${marker[0]}${selectedText}${marker[1]}`);
  return true;
}
