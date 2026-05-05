import { type Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createCodeMirrorEditorExtensions } from './codeMirrorEditorAdapterConfig';
import {
  type CodeMirrorEditorAdapterOptions,
  type EditorDocumentChangeMeta
} from './codeMirrorEditorAdapterSupport';

export function createCodeMirrorEditorView(args: {
  diffDecorationsCompartment: Compartment;
  textAnchorPresentation: import('./EditorAdapter').EditorTextAnchorPresentation;
  hideTitleHeading: boolean;
  host: HTMLElement;
  imageClozePresentationVersion: number;
  liveMarkdownCompartment: Compartment;
  liveMarkdownStateCompartment: Compartment;
  nodeId: string | null;
  onCompositionEnd: () => void;
  onDocChanged: (content: string, meta: EditorDocumentChangeMeta) => void;
  options: CodeMirrorEditorAdapterOptions;
  paragraphMarkerCompartment: Compartment;
  readOnlyCompartment: Compartment;
  searchDecorationsCompartment: Compartment;
  textAnchorDecorationsCompartment: Compartment;
}) {
  return new EditorView({
    parent: args.host,
    state: EditorState.create({
      doc: args.options.initialContent,
      extensions: createCodeMirrorEditorExtensions({
        diffDecorationsCompartment: args.diffDecorationsCompartment,
        textAnchorPresentation: args.textAnchorPresentation,
        hideTitleHeading: args.hideTitleHeading,
        imageClozePresentationVersion: args.imageClozePresentationVersion,
        liveMarkdownCompartment: args.liveMarkdownCompartment,
        liveMarkdownStateCompartment: args.liveMarkdownStateCompartment,
        nodeId: args.nodeId,
        onCompositionEnd: args.onCompositionEnd,
        onDocChanged: args.onDocChanged,
        options: args.options,
        paragraphMarkerCompartment: args.paragraphMarkerCompartment,
        readOnlyCompartment: args.readOnlyCompartment,
        searchDecorationsCompartment: args.searchDecorationsCompartment,
        textAnchorDecorationsCompartment: args.textAnchorDecorationsCompartment
      })
    })
  });
}
