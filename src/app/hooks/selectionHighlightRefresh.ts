import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

export function refreshSelectionHighlight(adapter: EditorAdapter | null) {
  if (!adapter) {
    return;
  }
  const selections = adapter.getSelectionRanges().filter((selection) => selection.from !== selection.to);
  if (selections.length === 0) {
    return;
  }
  requestAnimationFrame(() => {
    adapter.setSelectionRanges(selections);
    adapter.focus();
  });
}
