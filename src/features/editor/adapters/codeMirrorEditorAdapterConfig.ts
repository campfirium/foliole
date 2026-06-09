import { defaultKeymap, toggleComment } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, highlightActiveLine, keymap } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import { folioleMarkdownExtensions } from '../model/markdownOblikeExtension';

import {
  type CodeMirrorEditorAdapterOptions,
  type EditorDocumentChangeMeta,
  createReadOnlyExtensions,
  createLiveMarkdownReconfigureEffect
} from './codeMirrorEditorAdapterSupport';
import { createTextAnchorDecorationsExtension } from './codeMirrorTextAnchorState';
import { createLiveMarkdownExtensions } from './liveMarkdown';
import { createLiveMarkdownStateExtensions, trailingDividerFacet } from './liveMarkdownState';
import { trailingDividerExtension } from './liveMarkdownTrailingDivider';
import { markdownInputAssist } from './markdownInputAssist';

const folioleDefaultKeymap = defaultKeymap.filter((binding) => binding.run !== toggleComment);

function createEditorUpdateListener(args: {
  nodeId: string | null;
  onDocChanged: (content: string, meta: EditorDocumentChangeMeta) => void;
}) {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) {
      return;
    }
    const content = update.state.doc.toString();
    args.onDocChanged(content, { isComposing: update.view.composing, nodeId: args.nodeId });
  });
}

export function createCodeMirrorEditorExtensions(args: {
  diffDecorationsCompartment: import('@codemirror/state').Compartment;
  textAnchorDecorations: readonly import('./EditorAdapter').EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  localDocumentPath?: string | null;
  liveMarkdownCompartment: import('@codemirror/state').Compartment;
  liveMarkdownStateCompartment: import('@codemirror/state').Compartment;
  nodeId: string | null;
  onDocChanged: (content: string, meta: EditorDocumentChangeMeta) => void;
  onCompositionEnd: () => void;
  options: CodeMirrorEditorAdapterOptions;
  paragraphMarkerCompartment: import('@codemirror/state').Compartment;
  readOnlyCompartment: import('@codemirror/state').Compartment;
  searchDecorationsCompartment: import('@codemirror/state').Compartment;
  textAnchorDecorationsCompartment: import('@codemirror/state').Compartment;
}): Extension[] {
  return [
    markdown({ base: markdownLanguage, extensions: folioleMarkdownExtensions }),
    EditorState.allowMultipleSelections.of(true),
    keymap.of(folioleDefaultKeymap),
    args.readOnlyCompartment.of(createReadOnlyExtensions(args.options.readOnly === true)),
    EditorView.lineWrapping,
    highlightActiveLine(),
    markdownInputAssist,
    args.diffDecorationsCompartment.of(EditorView.decorations.of(Decoration.none)),
    args.paragraphMarkerCompartment.of(EditorView.decorations.of(Decoration.none)),
    args.searchDecorationsCompartment.of(EditorView.decorations.of(Decoration.none)),
    args.textAnchorDecorationsCompartment.of(createTextAnchorDecorationsExtension(args.textAnchorDecorations)),
    args.liveMarkdownCompartment.of(createLiveMarkdownExtensions()),
    trailingDividerFacet.of(args.options.trailingDivider === true),
    trailingDividerExtension,
    args.liveMarkdownStateCompartment.of(
      createLiveMarkdownStateExtensions({
        textAnchorDecorations: args.textAnchorDecorations,
        hideTitleHeading: args.hideTitleHeading,
        imageClozePresentationVersion: args.imageClozePresentationVersion,
        localDocumentPath: args.options.localDocumentPath ?? null,
        nodeId: args.nodeId,
        onMissingAttachmentResource: args.options.onMissingAttachmentResource ?? null,
        onOpenExternalLink: args.options.onOpenExternalLink ?? null,
        onOpenNodeLink: args.options.onOpenNodeLink ?? null,
        onPreviewNodeLink: args.options.onPreviewNodeLink ?? null,
        onPastedAnchors: args.options.onPastedAnchors ?? null
      })
    ),
    EditorView.domEventHandlers({
      compositionend: () => {
        args.onCompositionEnd();
        return false;
      }
    }),
    createEditorUpdateListener(args)
  ];
}

export function createLiveMarkdownEffect(args: {
  compartment: import('@codemirror/state').Compartment;
  textAnchorDecorations: readonly import('./EditorAdapter').EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  localDocumentPath?: string | null;
  nodeId: string | null;
  onMissingAttachmentResource?: import('./EditorAdapter').EditorMissingAttachmentResourceHandler | null;
  onOpenExternalLink?: ((request: ExternalLinkOpenRequest) => void) | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPreviewNodeLink?: ((request: import('../model/nodeLinkPreview').EditorNodeLinkPreviewRequest | null) => void) | null;
  onPastedAnchors?: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
}) {
  return createLiveMarkdownReconfigureEffect(args);
}
