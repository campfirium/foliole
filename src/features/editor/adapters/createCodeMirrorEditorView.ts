import { type Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createCodeMirrorEditorExtensions } from './codeMirrorEditorAdapterConfig';
import {
  type CodeMirrorEditorAdapterOptions,
  type EditorDocumentChangeMeta
} from './codeMirrorEditorAdapterSupport';

export function createCodeMirrorEditorView(args: {
  diffDecorationsCompartment: Compartment;
  hiddenTextAnchorKeys: readonly string[];
  hideTitleHeading: boolean;
  host: HTMLElement;
  imageClozePresentationVersion: number;
  liveMarkdownCompartment: Compartment;
  nodeId: string | null;
  onCompositionEnd: () => void;
  onDocChanged: (content: string, meta: EditorDocumentChangeMeta) => void;
  options: CodeMirrorEditorAdapterOptions;
  paragraphMarkerCompartment: Compartment;
  readOnlyCompartment: Compartment;
  searchDecorationsCompartment: Compartment;
}) {
  return new EditorView({
    parent: args.host,
    state: EditorState.create({
      doc: args.options.initialContent,
      extensions: createCodeMirrorEditorExtensions({
        diffDecorationsCompartment: args.diffDecorationsCompartment,
        hiddenTextAnchorKeys: args.hiddenTextAnchorKeys,
        hideTitleHeading: args.hideTitleHeading,
        imageClozePresentationVersion: args.imageClozePresentationVersion,
        liveMarkdownCompartment: args.liveMarkdownCompartment,
        nodeId: args.nodeId,
        onCompositionEnd: args.onCompositionEnd,
        onDocChanged: args.onDocChanged,
        options: args.options,
        paragraphMarkerCompartment: args.paragraphMarkerCompartment,
        readOnlyCompartment: args.readOnlyCompartment,
        searchDecorationsCompartment: args.searchDecorationsCompartment
      })
    })
  });
}
