import { StateField } from '@codemirror/state';
import { EditorView, type DecorationSet } from '@codemirror/view';

export function createMappedDecorationsExtension(initialDecorations: DecorationSet) {
  return StateField.define<DecorationSet>({
    create: () => initialDecorations,
    update: (decorations, transaction) => decorations.map(transaction.changes),
    provide: (field) => EditorView.decorations.from(field)
  });
}
