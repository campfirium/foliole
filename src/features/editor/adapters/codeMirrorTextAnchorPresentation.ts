import { applyTextAnchorDecorations } from './codeMirrorEditorMutations';
import type { EditorTextAnchorPresentation } from './EditorAdapter';

export function hasSameLegacyHiddenAnchorKeys(
  currentKeys: readonly string[],
  nextKeys: readonly string[]
) {
  return currentKeys.length === nextKeys.length && currentKeys.every((key, index) => key === nextKeys[index]);
}

export function shouldReconfigureForTextAnchorPresentation(
  currentPresentation: EditorTextAnchorPresentation,
  nextPresentation: EditorTextAnchorPresentation
) {
  return !hasSameLegacyHiddenAnchorKeys(
    currentPresentation.inlineAnchorCompatibility.hiddenKeys,
    nextPresentation.inlineAnchorCompatibility.hiddenKeys
  );
}

export function applyEditorTextAnchorPresentation(args: {
  compartment: import('@codemirror/state').Compartment;
  textAnchorPresentation: EditorTextAnchorPresentation;
  view: import('@codemirror/view').EditorView;
}) {
  applyTextAnchorDecorations({
    compartment: args.compartment,
    textAnchorDecorations: args.textAnchorPresentation.textAnchorDecorations,
    view: args.view
  });
}
