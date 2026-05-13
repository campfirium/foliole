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

function normalizeTextAnchorDecoration(
  decoration: EditorTextAnchorDecoration,
  docLength: number
): EditorTextAnchorDecoration {
  const from = Math.max(0, Math.min(decoration.from, docLength));
  const to = Math.max(from, Math.min(decoration.to, docLength));
  return {
    from,
    kind: decoration.kind,
    to
  };
}

function normalizeTextAnchorDecorations(
  decorations: readonly EditorTextAnchorDecoration[],
  docLength: number
): readonly EditorTextAnchorDecoration[] {
  return decorations.map((decoration) => normalizeTextAnchorDecoration(decoration, docLength));
}

function mapTextAnchorDecorationThroughChanges(
  decoration: EditorTextAnchorDecoration,
  changes: ChangeDesc
): EditorTextAnchorDecoration {
  return {
    from: changes.mapPos(decoration.from, -1),
    kind: decoration.kind,
    to: changes.mapPos(decoration.to, 1)
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
      !leftDecoration ||
      !rightDecoration ||
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
      const normalizedInitialDecorations = normalizeTextAnchorDecorations(initialDecorations, state.doc.length);
      return {
        decorations: buildEditorTextAnchorDecorations(state.doc.length, normalizedInitialDecorations),
        source: normalizedInitialDecorations
      };
    },
    update(value, transaction) {
      const normalizedCurrentSource = normalizeTextAnchorDecorations(value.source, transaction.startState.doc.length);
      const mappedSource = transaction.docChanged
        ? mapTextAnchorDecorationsThroughChanges(normalizedCurrentSource, transaction.changes)
        : normalizedCurrentSource;
      let nextValue: TextAnchorDecorationFieldValue = {
        decorations: value.decorations.map(transaction.changes),
        source: mappedSource
      };
      for (const effect of transaction.effects) {
        if (effect.is(setTextAnchorDecorationsEffect)) {
          const normalizedEffectValue = normalizeTextAnchorDecorations(effect.value, transaction.state.doc.length);
          if (areTextAnchorDecorationsEqual(nextValue.source, normalizedEffectValue)) {
            continue;
          }
          nextValue = {
            decorations: buildEditorTextAnchorDecorations(transaction.state.doc.length, normalizedEffectValue),
            source: normalizedEffectValue
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
