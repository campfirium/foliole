import { type Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type {
  CodeMirrorEditorAdapterOptions
} from './codeMirrorEditorAdapterSupport';
import { createCodeMirrorEditorControllers } from './codeMirrorEditorControllers';
import { createCodeMirrorEditorView } from './createCodeMirrorEditorView';
import type { EditorTextAnchorDecoration } from './EditorAdapter';
import type { EditorExternalChangeBuffer } from './editorExternalChangeBuffer';

interface CodeMirrorEditorAdapterRuntimeArgs {
  diffDecorationsCompartment: Compartment;
  getContent: () => string;
  getNodeId: () => string | null;
  getOnChange: () => ((content: string) => void) | undefined;
  host: HTMLElement;
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  isApplyingExternalContent: () => boolean;
  liveMarkdownCompartment: Compartment;
  liveMarkdownStateCompartment: Compartment;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  onSetContent: (content: string) => void;
  options: CodeMirrorEditorAdapterOptions;
  paragraphMarkerCompartment: Compartment;
  readOnlyCompartment: Compartment;
  searchDecorationsCompartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  textAnchorDecorationsCompartment: Compartment;
}

function createEditorControllers(args: CodeMirrorEditorAdapterRuntimeArgs) {
  const controllers = createCodeMirrorEditorControllers({
    applyLocalizedContent: (localized) => {
      args.onSetContent(localized);
      args.getOnChange()?.(localized);
    },
    getContent: args.getContent,
    getNodeId: args.getNodeId,
    isApplyingExternalContent: args.isApplyingExternalContent,
    onFlush: (content) => {
      const onChange = args.getOnChange();
      if (!onChange) {
        return;
      }
      onChange(content);
      controllers.remoteImageLocalization.schedule();
    }
  });
  return {
    externalChangeBuffer: controllers.externalChangeBuffer,
    remoteImageLocalization: controllers.remoteImageLocalization
  };
}

function createEditorViewRuntime(
  args: CodeMirrorEditorAdapterRuntimeArgs,
  externalChangeBuffer: EditorExternalChangeBuffer
) {
  return createCodeMirrorEditorView({
    diffDecorationsCompartment: args.diffDecorationsCompartment,
    hideTitleHeading: args.hideTitleHeading,
    host: args.host,
    imageClozePresentationVersion: args.imageClozePresentationVersion,
    liveMarkdownCompartment: args.liveMarkdownCompartment,
    liveMarkdownStateCompartment: args.liveMarkdownStateCompartment,
    nodeId: args.getNodeId(),
    onCompositionEnd: () => externalChangeBuffer.handleCompositionEnd(),
    onDocChanged: (content, meta) => {
      if (!args.getOnChange() || args.isApplyingExternalContent()) {
        return;
      }
      externalChangeBuffer.handleDocumentChange(content, meta);
    },
    options: args.options,
    paragraphMarkerCompartment: args.paragraphMarkerCompartment,
    readOnlyCompartment: args.readOnlyCompartment,
    searchDecorationsCompartment: args.searchDecorationsCompartment,
    textAnchorDecorations: args.textAnchorDecorations,
    textAnchorDecorationsCompartment: args.textAnchorDecorationsCompartment
  });
}

export function createCodeMirrorEditorAdapterRuntime(args: CodeMirrorEditorAdapterRuntimeArgs) {
  const { externalChangeBuffer, remoteImageLocalization } = createEditorControllers(args);
  const view: EditorView = createEditorViewRuntime(args, externalChangeBuffer);
  return { externalChangeBuffer, remoteImageLocalization, view };
}
