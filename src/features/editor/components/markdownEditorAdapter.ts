import { useLayoutEffect, useRef, type MutableRefObject } from 'react';

import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/diagnostics/debugTrace';
import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import { EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS, type EditorAdapter, type EditorTextAnchorDecoration } from '../adapters/EditorAdapter';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import { createMarkdownEditorAdapter } from './markdownEditorAdapterFactory';
import { useTextAnchorPresentationSync } from './markdownEditorTextAnchorSync';
import type { MarkdownEditorProps } from './markdownEditorTypes';

function resolveTextAnchorDecorations(textAnchorDecorations: MarkdownEditorProps['textAnchorDecorations']) {
  return textAnchorDecorations ?? EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS;
}

function syncEditorAdapterInputRefs(
  refs: ReturnType<typeof useEditorAdapterInputs>,
  args: Parameters<typeof useEditorAdapterInputs>[0],
  resolvedTextAnchorDecorations: readonly EditorTextAnchorDecoration[]
) {
  refs.applicationCutEnabledRef.current = args.applicationCutEnabled;
  refs.onChangeRef.current = args.onChange;
  refs.onDocumentInputRef.current = args.onDocumentInput;
  refs.onMissingAttachmentResourceRef.current = args.onMissingAttachmentResource;
  refs.initialValueRef.current = args.initialValue;
  refs.liveMarkdownEnabledRef.current = args.liveMarkdownEnabled;
  refs.localDocumentPathRef.current = args.localDocumentPath ?? null;
  refs.onOpenExternalLinkRef.current = args.onOpenExternalLink;
  refs.onOpenNodeLinkRef.current = args.onOpenNodeLink;
  refs.onPreviewNodeLinkRef.current = args.onPreviewNodeLink;
  refs.onPastedAnchorsRef.current = args.onPastedAnchors;
  refs.onRedoRef.current = args.onRedo;
  refs.onReadyRef.current = args.onReady;
  refs.onUndoRef.current = args.onUndo;
  refs.hideTitleHeadingRef.current = args.hideTitleHeading;
  refs.readOnlyRef.current = args.readOnly;
  refs.readOnlyInteractionModeRef.current = args.readOnlyInteractionMode;
  refs.trailingDividerRef.current = args.trailingDivider;
  refs.textAnchorDecorationsRef.current = resolvedTextAnchorDecorations;
}

function useEditorAdapterInputRefs(
  args: Parameters<typeof useEditorAdapterInputs>[0],
  resolvedTextAnchorDecorations: readonly EditorTextAnchorDecoration[]
) {
  return {
    applicationCutEnabledRef: useRef(args.applicationCutEnabled),
    hideTitleHeadingRef: useRef(args.hideTitleHeading),
    initialValueRef: useRef(args.initialValue),
    liveMarkdownEnabledRef: useRef(args.liveMarkdownEnabled),
    localDocumentPathRef: useRef(args.localDocumentPath ?? null),
    onChangeRef: useRef(args.onChange),
    onDocumentInputRef: useRef(args.onDocumentInput),
    onMissingAttachmentResourceRef: useRef(args.onMissingAttachmentResource),
    onOpenExternalLinkRef: useRef(args.onOpenExternalLink),
    onOpenNodeLinkRef: useRef(args.onOpenNodeLink),
    onPreviewNodeLinkRef: useRef(args.onPreviewNodeLink),
    onPastedAnchorsRef: useRef(args.onPastedAnchors),
    onReadyRef: useRef(args.onReady),
    onRedoRef: useRef(args.onRedo),
    onUndoRef: useRef(args.onUndo),
    readOnlyInteractionModeRef: useRef(args.readOnlyInteractionMode),
    readOnlyRef: useRef(args.readOnly),
    resolvedTextAnchorDecorations,
    textAnchorDecorationsRef: useRef(resolvedTextAnchorDecorations),
    trailingDividerRef: useRef(args.trailingDivider)
  };
}

function useEditorAdapterInputs(args: {
  applicationCutEnabled: boolean | undefined;
  hideTitleHeading: boolean;
  initialValue: string;
  liveMarkdownEnabled: boolean | undefined;
  localDocumentPath?: string | null;
  onChange: MarkdownEditorProps['onChange'];
  onDocumentInput: MarkdownEditorProps['onDocumentInput'];
  onMissingAttachmentResource: MarkdownEditorProps['onMissingAttachmentResource'];
  onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | undefined;
  onOpenNodeLink: ((title: string) => void) | undefined;
  onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | undefined;
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'];
  onRedo: MarkdownEditorProps['onRedo'];
  onReady: ((adapter: EditorAdapter | null) => void) | undefined;
  onUndo: MarkdownEditorProps['onUndo'];
  readOnly: boolean | undefined;
  readOnlyInteractionMode: MarkdownEditorProps['readOnlyInteractionMode'];
  textAnchorDecorations: MarkdownEditorProps['textAnchorDecorations'];
  trailingDivider: boolean | undefined;
}) {
  const resolvedTextAnchorDecorations = resolveTextAnchorDecorations(args.textAnchorDecorations);
  const refs = useEditorAdapterInputRefs(args, resolvedTextAnchorDecorations);
  syncEditorAdapterInputRefs(refs, args, resolvedTextAnchorDecorations);
  return refs;
}

function useEditorAdapterLifecycle(args: {
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>;
  debugId: string | undefined;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  inputs: ReturnType<typeof useEditorAdapterInputs>;
}) {
  const { adapterRef, debugId, hostRef, inputs } = args;
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || adapterRef.current) {
      return;
    }

    const adapter = createMarkdownEditorAdapter({
      applicationCutEnabled: inputs.applicationCutEnabledRef.current,
      debugId,
      hideTitleHeading: inputs.hideTitleHeadingRef.current,
      host,
      initialContent: inputs.initialValueRef.current,
      liveMarkdownEnabled: inputs.liveMarkdownEnabledRef.current,
      localDocumentPath: inputs.localDocumentPathRef.current,
      onChange: (nextValue, meta) => inputs.onChangeRef.current(nextValue, meta),
      onDocumentInput: (meta) => inputs.onDocumentInputRef.current?.(meta),
      onMissingAttachmentResource: (attachmentId) => inputs.onMissingAttachmentResourceRef.current?.(attachmentId),
      onOpenExternalLink: (href) => inputs.onOpenExternalLinkRef.current?.(href),
      onOpenNodeLink: (title) => inputs.onOpenNodeLinkRef.current?.(title),
      onPreviewNodeLink: (request) => inputs.onPreviewNodeLinkRef.current?.(request),
      onPastedAnchors: (payload) => inputs.onPastedAnchorsRef.current?.(payload),
      onRedo: () => inputs.onRedoRef.current?.() ?? false,
      readOnly: inputs.readOnlyRef.current,
      readOnlyInteractionMode: inputs.readOnlyInteractionModeRef.current,
      textAnchorDecorations: inputs.textAnchorDecorationsRef.current,
      trailingDivider: inputs.trailingDividerRef.current,
      onUndo: () => inputs.onUndoRef.current?.() ?? false
    });
    adapterRef.current = adapter;
    if (debugId) {
      registerDebugEditorAdapter(debugId, adapter);
    }
    inputs.onReadyRef.current?.(adapter);

    return () => {
      inputs.onReadyRef.current?.(null);
      if (debugId) {
        clearDebugEditorAdapter(debugId);
      }
      adapter.destroy();
      adapterRef.current = null;
    };
  }, [adapterRef, debugId, hostRef]);
}

export function useEditorAdapter(
  hostRef: MutableRefObject<HTMLDivElement | null>,
  debugId: string | undefined,
  onChange: MarkdownEditorProps['onChange'],
  onDocumentInput: MarkdownEditorProps['onDocumentInput'],
  onReady: ((adapter: EditorAdapter | null) => void) | undefined,
  initialValue: string,
  localDocumentPath: string | null | undefined,
  liveMarkdownEnabled: boolean | undefined,
  textAnchorDecorations: MarkdownEditorProps['textAnchorDecorations'],
  hideTitleHeading: boolean,
  applicationCutEnabled: boolean | undefined,
  onMissingAttachmentResource: MarkdownEditorProps['onMissingAttachmentResource'],
  onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | undefined,
  onOpenNodeLink: ((title: string) => void) | undefined,
  onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | undefined,
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'],
  onRedo: MarkdownEditorProps['onRedo'],
  onUndo: MarkdownEditorProps['onUndo'],
  readOnly: boolean | undefined,
  readOnlyInteractionMode: MarkdownEditorProps['readOnlyInteractionMode'],
  trailingDivider: boolean | undefined
) {
  const adapterRef = useRef<CodeMirrorEditorAdapter | null>(null);
  const inputs = useEditorAdapterInputs({
    applicationCutEnabled,
    hideTitleHeading,
    initialValue,
    liveMarkdownEnabled,
    localDocumentPath: localDocumentPath ?? null,
    onChange,
    onDocumentInput,
    onMissingAttachmentResource,
    onOpenExternalLink,
    onOpenNodeLink,
    onPreviewNodeLink,
    onPastedAnchors,
    onRedo,
    onReady,
    onUndo,
    readOnly,
    readOnlyInteractionMode,
    textAnchorDecorations,
    trailingDivider
  });

  useEditorAdapterLifecycle({ adapterRef, debugId, hostRef, inputs });

  useTextAnchorPresentationSync(adapterRef, inputs.resolvedTextAnchorDecorations, initialValue);

  useLayoutEffect(() => {
    adapterRef.current?.setLocalDocumentPath?.(localDocumentPath ?? null);
  }, [localDocumentPath]);

  useLayoutEffect(() => {
    adapterRef.current?.setReadOnly?.(readOnly === true);
  }, [readOnly]);

  return adapterRef;
}
