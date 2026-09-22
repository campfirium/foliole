import { StateEffect, type ChangeDesc } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';

import { activeNodeIdFacet } from './liveMarkdownState';

interface PasteTarget {
  from: number;
  to: number;
  valid: boolean;
}

function mapTarget(target: PasteTarget, changes: ChangeDesc) {
  changes.iterChangedRanges((from, to) => {
    if (from < target.to && to > target.from) target.valid = false;
  });
  if (!target.valid) return;
  const empty = target.from === target.to;
  target.from = changes.mapPos(target.from, 1);
  target.to = empty ? target.from : changes.mapPos(target.to, -1);
}

const pendingImagePastes = ViewPlugin.fromClass(class {
  readonly targets = new Set<PasteTarget>();

  update(update: ViewUpdate) {
    const replaced = update.startState.facet(activeNodeIdFacet) !== update.state.facet(activeNodeIdFacet);
    const invalidated = replaced || update.state.readOnly || update.transactions.some((transaction) =>
      transaction.docChanged && (!transaction.isUserEvent('input') && !transaction.isUserEvent('delete')));
    for (const target of this.targets) {
      if (invalidated) target.valid = false;
      else if (update.docChanged) mapTarget(target, update.changes);
      if (!target.valid) this.targets.delete(target);
    }
  }

  destroy() {
    for (const target of this.targets) target.valid = false;
    this.targets.clear();
  }
});

export function trackClipboardImagePaste(view: EditorView) {
  if (!view.plugin(pendingImagePastes)) {
    view.dispatch({ effects: StateEffect.appendConfig.of(pendingImagePastes) });
  }
  const tracker = view.plugin(pendingImagePastes)!;
  const { from, to } = view.state.selection.main;
  const target: PasteTarget = { from, to, valid: true };
  tracker.targets.add(target);
  const release = () => {
    tracker.targets.delete(target);
    target.valid = false;
  };
  return {
    release,
    apply(content: string) {
      if (!target.valid) return false;
      const { from, to } = target;
      const selection = view.state.selection;
      const stillSelected = selection.ranges.length === 1 && selection.main.from === from && selection.main.to === to;
      release();
      view.dispatch({
        changes: { from, to, insert: content },
        ...(stillSelected ? { selection: { anchor: from + content.length } } : {}),
        userEvent: 'input.paste'
      });
      return true;
    }
  };
}
