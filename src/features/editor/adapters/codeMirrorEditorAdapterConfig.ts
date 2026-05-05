import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view';

import { anchorStructureGuard } from './anchorStructureGuard';
import {
  type CodeMirrorEditorAdapterOptions,
  type EditorDocumentChangeMeta,
  createReadOnlyExtensions,
  createLiveMarkdownReconfigureEffect
} from './codeMirrorEditorAdapterSupport';
import { createLiveMarkdown } from './liveMarkdown';
import { markdownInputAssist } from './markdownInputAssist';

export function createCodeMirrorEditorExtensions(args: {
  diffDecorationsCompartment: import('@codemirror/state').Compartment;
  hiddenTextAnchorKeys: readonly string[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  liveMarkdownCompartment: import('@codemirror/state').Compartment;
  nodeId: string | null;
  onDocChanged: (content: string, meta: EditorDocumentChangeMeta) => void;
  onCompositionEnd: () => void;
  options: CodeMirrorEditorAdapterOptions;
  paragraphMarkerCompartment: import('@codemirror/state').Compartment;
  readOnlyCompartment: import('@codemirror/state').Compartment;
  searchDecorationsCompartment: import('@codemirror/state').Compartment;
}): Extension[] {
  return [
    markdown(),
    anchorStructureGuard,
    history(),
    EditorState.allowMultipleSelections.of(true),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    args.readOnlyCompartment.of(createReadOnlyExtensions(args.options.readOnly === true)),
    drawSelection(),
    EditorView.lineWrapping,
    highlightActiveLine(),
    markdownInputAssist,
    args.diffDecorationsCompartment.of(EditorView.decorations.of(Decoration.none)),
    args.paragraphMarkerCompartment.of(EditorView.decorations.of(Decoration.none)),
    args.searchDecorationsCompartment.of(EditorView.decorations.of(Decoration.none)),
    args.liveMarkdownCompartment.of(
      createLiveMarkdown(
        args.hideTitleHeading,
        args.nodeId,
        args.imageClozePresentationVersion,
        args.hiddenTextAnchorKeys,
        args.options.onOpenNodeLink ?? null
      )
    ),
    EditorView.domEventHandlers({
      compositionend: () => {
        args.onCompositionEnd();
        return false;
      }
    }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) {
        return;
      }
      args.onDocChanged(update.state.doc.toString(), { isComposing: update.view.composing });
    })
  ];
}

export function createLiveMarkdownEffect(args: {
  compartment: import('@codemirror/state').Compartment;
  hiddenTextAnchorKeys: readonly string[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
}) {
  return createLiveMarkdownReconfigureEffect(args);
}
