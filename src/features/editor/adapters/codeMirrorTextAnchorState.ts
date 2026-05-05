import {
  type ChangeDesc,
  StateEffect,
  StateField,
  type Extension
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView
} from '@codemirror/view';

import type { EditorTextAnchorDecoration } from './EditorAdapter';
import { buildEditorTextAnchorDecorations } from './textAnchorDecorations';

const setTextAnchorDecorationsEffect = StateEffect.define<readonly EditorTextAnchorDecoration[]>();

interface TextAnchorDecorationFieldValue {
  decorations: DecorationSet;
  source: readonly EditorTextAnchorDecoration[];
}

function mapTextAnchorDecorationThroughChanges(
  decoration: EditorTextAnchorDecoration,
  changes: ChangeDesc
): EditorTextAnchorDecoration {
  return {
    from: changes.mapPos(decoration.from, 1),
    kind: decoration.kind,
    to: changes.mapPos(decoration.to, -1)
  };
}

function mapTextAnchorDecorationsThroughChanges(
  decorations: readonly EditorTextAnchorDecoration[],
  changes: ChangeDesc
): readonly EditorTextAnchorDecoration[] {
  return decorations.map((decoration) => mapTextAnchorDecorationThroughChanges(decoration, changes));
}

function areTextAnchorDecorationsEqual(
  left: readonly EditorTextAnchorDecoration[],
  right: readonly EditorTextAnchorDecoration[]
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftDecoration = left[index];
    const rightDecoration = right[index];
    if (
      leftDecoration.from !== rightDecoration.from ||
      leftDecoration.to !== rightDecoration.to ||
      leftDecoration.kind !== rightDecoration.kind
    ) {
      return false;
    }
  }
  return true;
}

function createTextAnchorDecorationField(
  initialDecorations: readonly EditorTextAnchorDecoration[]
) {
  return StateField.define<TextAnchorDecorationFieldValue>({
    create(state) {
      return {
        decorations: buildEditorTextAnchorDecorations(state.doc.length, initialDecorations),
        source: initialDecorations
      };
    },
    update(value, transaction) {
      const mappedSource = transaction.docChanged
        ? mapTextAnchorDecorationsThroughChanges(value.source, transaction.changes)
        : value.source;
      let nextValue: TextAnchorDecorationFieldValue = {
        decorations: value.decorations.map(transaction.changes),
        source: mappedSource
      };
      for (const effect of transaction.effects) {
        if (effect.is(setTextAnchorDecorationsEffect)) {
          if (areTextAnchorDecorationsEqual(nextValue.source, effect.value)) {
            continue;
          }
          nextValue = {
            decorations: buildEditorTextAnchorDecorations(transaction.state.doc.length, effect.value),
            source: effect.value
          };
        }
      }
      return nextValue;
    },
    provide(field) {
      return EditorView.decorations.from(field, (value) => value.decorations);
    }
  });
}

export function createTextAnchorDecorationsExtension(
  initialDecorations: readonly EditorTextAnchorDecoration[]
): Extension {
  return createTextAnchorDecorationField(initialDecorations);
}

export function updateTextAnchorDecorations(args: {
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: EditorView;
}) {
  args.view.dispatch({
    effects: setTextAnchorDecorationsEffect.of(args.textAnchorDecorations)
  });
}

export function createEmptyTextAnchorDecorationsExtension() {
  return EditorView.decorations.of(Decoration.none);
}
