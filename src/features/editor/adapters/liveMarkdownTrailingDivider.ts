import { StateField, type EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

import { trailingDividerFacet } from './liveMarkdownState';

class TrailingDividerWidget extends WidgetType {
  override eq(other: TrailingDividerWidget) {
    return other instanceof TrailingDividerWidget;
  }

  override toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-document-section-divider';
    wrapper.setAttribute('aria-hidden', 'true');
    const rule = document.createElement('span');
    rule.className = 'cm-md-thematic-break';
    wrapper.append(rule);
    return wrapper;
  }
}

function buildTrailingDividerDecorations(state: EditorState): DecorationSet {
  if (!state.facet(trailingDividerFacet)) {
    return Decoration.none;
  }
  return Decoration.set([
    Decoration.widget({
      block: true,
      side: 1,
      widget: new TrailingDividerWidget()
    }).range(state.doc.length)
  ]);
}

export const trailingDividerExtension = StateField.define<DecorationSet>({
  create: buildTrailingDividerDecorations,
  update(value, transaction) {
    if (
      transaction.docChanged ||
      transaction.startState.facet(trailingDividerFacet) !== transaction.state.facet(trailingDividerFacet)
    ) {
      return buildTrailingDividerDecorations(transaction.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field)
});
