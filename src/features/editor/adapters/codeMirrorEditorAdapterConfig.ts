import { defaultKeymap, redo, toggleComment, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, highlightActiveLine, keymap, type ViewUpdate } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import { folioleMarkdownLanguageExtensions } from '../model/folioleMarkdownParser';

import {
  type CodeMirrorEditorAdapterOptions,
  type EditorDocumentChangeMeta,
  createReadOnlyExtensions,
  createLiveMarkdownReconfigureEffect
} from './codeMirrorEditorAdapterSupport';
import { markdownFormattingKeymap } from './codeMirrorMarkdownFormatting';
import { syncParagraphMarkerSelectionVisibility } from './codeMirrorParagraphMarkerState';
import { createTextAnchorDecorationsExtension } from './codeMirrorTextAnchorState';
import { editorDiffDecorationsStateField } from './lineDiffDecorations';
import { createLiveMarkdownExtensions } from './liveMarkdown';
import { createApplicationCutExtensions } from './liveMarkdownInteractions';
import { createLiveMarkdownStateExtensions, trailingDividerFacet } from './liveMarkdownState';
import { trailingDividerExtension } from './liveMarkdownTrailingDivider';
import { markdownInputAssist } from './markdownInputAssist';

const folioleDefaultKeymap = defaultKeymap.filter(
  (binding) => binding.run !== toggleComment && binding.run !== undo && binding.run !== redo
);

function createEditorUpdateListener(args: {
  nodeId: string | null;
  onDocChanged: (content: string | null, meta: EditorDocumentChangeMeta, update: ViewUpdate) => void;
}) {
  return EditorView.updateListener.of((update) => {
    if (update.selectionSet) {
      syncParagraphMarkerSelectionVisibility(update.view);
    }
    if (!update.docChanged) {
      return;
    }
    args.onDocChanged(null, { contentLength: update.state.doc.length, isComposing: update.view.composing, nodeId: args.nodeId }, update);
  });
}

function blurActiveCodeMirrorElement(view: EditorView) {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !view.dom.contains(activeElement)) {
    return;
  }
  activeElement.blur();
}

function blurCodeMirrorEditorOnEscape(event: KeyboardEvent, view: EditorView) {
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return false;
  }
  blurActiveCodeMirrorElement(view);
  window.setTimeout(() => blurActiveCodeMirrorElement(view), 0);
  return false;
}

const escapeBlurKeymap = [{
  key: 'Escape',
  run: (view: EditorView) => {
    blurActiveCodeMirrorElement(view);
    window.setTimeout(() => blurActiveCodeMirrorElement(view), 0);
    return true;
  }
}];

function createEditorInputExtensions(options: CodeMirrorEditorAdapterOptions) {
  return [
    keymap.of([...escapeBlurKeymap, ...markdownFormattingKeymap, ...folioleDefaultKeymap]),
    ...createApplicationCutExtensions(options.applicationCutEnabled === true)
  ];
}

function createReadOnlyInteractionExtensions(options: CodeMirrorEditorAdapterOptions) {
  if (options.readOnlyInteractionMode !== 'document') {
    return [];
  }
  return [
    EditorView.editorAttributes.of({
      'aria-readonly': 'true',
      role: 'document',
      tabindex: '-1'
    }),
    EditorView.contentAttributes.of({
      'aria-readonly': 'true',
      inputmode: 'none',
      role: 'document',
      tabindex: '-1'
    })
  ];
}

function createReadOnlyDocumentDomHandlers(options: CodeMirrorEditorAdapterOptions) {
  if (options.readOnlyInteractionMode !== 'document') {
    return {};
  }
  const blurReadOnlyDocument = (_event: FocusEvent, view: EditorView) => {
    blurActiveCodeMirrorElement(view);
    window.setTimeout(() => blurActiveCodeMirrorElement(view), 0);
    return false;
  };
  return {
    focus: blurReadOnlyDocument,
    focusin: blurReadOnlyDocument
  };
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
  onDocChanged: (content: string | null, meta: EditorDocumentChangeMeta, update: ViewUpdate) => void;
  onCompositionEnd: () => void;
  options: CodeMirrorEditorAdapterOptions;
  paragraphMarkerCompartment: import('@codemirror/state').Compartment;
  readOnlyCompartment: import('@codemirror/state').Compartment;
  searchDecorationsCompartment: import('@codemirror/state').Compartment;
  textAnchorDecorationsCompartment: import('@codemirror/state').Compartment;
}): Extension[] {
  return [
    markdown({ base: markdownLanguage, extensions: folioleMarkdownLanguageExtensions }),
    EditorState.allowMultipleSelections.of(true),
    ...createEditorInputExtensions(args.options),
    args.readOnlyCompartment.of(createReadOnlyExtensions(args.options.readOnly === true)),
    ...createReadOnlyInteractionExtensions(args.options),
    EditorView.lineWrapping,
    highlightActiveLine(),
    markdownInputAssist,
    args.diffDecorationsCompartment.of(editorDiffDecorationsStateField),
    args.paragraphMarkerCompartment.of(EditorView.decorations.of(Decoration.none)),
    args.searchDecorationsCompartment.of(EditorView.decorations.of(Decoration.none)),
    args.textAnchorDecorationsCompartment.of(createTextAnchorDecorationsExtension(args.textAnchorDecorations)),
    args.liveMarkdownCompartment.of(args.options.liveMarkdownEnabled === false ? [] : createLiveMarkdownExtensions()),
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
      },
      ...createReadOnlyDocumentDomHandlers(args.options),
      keydown: (event, view) => {
        return blurCodeMirrorEditorOnEscape(event, view);
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
