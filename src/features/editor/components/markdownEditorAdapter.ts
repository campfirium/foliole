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
  refs.onChangeRef.current = args.onChange;
  refs.onDocumentInputRef.current = args.onDocumentInput;
  refs.onMissingAttachmentResourceRef.current = args.onMissingAttachmentResource;
  refs.initialValueRef.current = args.initialValue;
  refs.localDocumentPathRef.current = args.localDocumentPath ?? null;
  refs.onOpenExternalLinkRef.current = args.onOpenExternalLink;
  refs.onOpenNodeLinkRef.current = args.onOpenNodeLink;
  refs.onPreviewNodeLinkRef.current = args.onPreviewNodeLink;
  refs.onPastedAnchorsRef.current = args.onPastedAnchors;
  refs.onReadyRef.current = args.onReady;
  refs.hideTitleHeadingRef.current = args.hideTitleHeading;
  refs.readOnlyRef.current = args.readOnly;
  refs.trailingDividerRef.current = args.trailingDivider;
  refs.textAnchorDecorationsRef.current = resolvedTextAnchorDecorations;
}

function useEditorAdapterInputs(args: {
  hideTitleHeading: boolean;
  initialValue: string;
  localDocumentPath?: string | null;
  onChange: MarkdownEditorProps['onChange'];
  onDocumentInput: MarkdownEditorProps['onDocumentInput'];
  onMissingAttachmentResource: MarkdownEditorProps['onMissingAttachmentResource'];
  onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | undefined;
  onOpenNodeLink: ((title: string) => void) | undefined;
  onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | undefined;
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'];
  onReady: ((adapter: EditorAdapter | null) => void) | undefined;
  readOnly: boolean | undefined;
  textAnchorDecorations: MarkdownEditorProps['textAnchorDecorations'];
  trailingDivider: boolean | undefined;
}) {
  const initialValueRef = useRef(args.initialValue);
  const localDocumentPathRef = useRef(args.localDocumentPath ?? null);
  const onChangeRef = useRef(args.onChange);
  const onDocumentInputRef = useRef(args.onDocumentInput);
  const onMissingAttachmentResourceRef = useRef(args.onMissingAttachmentResource);
  const onOpenExternalLinkRef = useRef(args.onOpenExternalLink);
  const onOpenNodeLinkRef = useRef(args.onOpenNodeLink);
  const onPreviewNodeLinkRef = useRef(args.onPreviewNodeLink);
  const onPastedAnchorsRef = useRef(args.onPastedAnchors);
  const onReadyRef = useRef(args.onReady);
  const hideTitleHeadingRef = useRef(args.hideTitleHeading);
  const readOnlyRef = useRef(args.readOnly);
  const trailingDividerRef = useRef(args.trailingDivider);
  const resolvedTextAnchorDecorations = resolveTextAnchorDecorations(args.textAnchorDecorations);
  const textAnchorDecorationsRef = useRef(resolvedTextAnchorDecorations);

  const refs = {
    hideTitleHeadingRef,
    initialValueRef,
    localDocumentPathRef,
    onChangeRef,
    onDocumentInputRef,
    onMissingAttachmentResourceRef,
    onOpenExternalLinkRef,
    onOpenNodeLinkRef,
    onPreviewNodeLinkRef,
    onPastedAnchorsRef,
    onReadyRef,
    readOnlyRef,
    resolvedTextAnchorDecorations,
    textAnchorDecorationsRef,
    trailingDividerRef
  };
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
      debugId,
      hideTitleHeading: inputs.hideTitleHeadingRef.current,
      host,
      initialContent: inputs.initialValueRef.current,
      localDocumentPath: inputs.localDocumentPathRef.current,
      onChange: (nextValue, meta) => inputs.onChangeRef.current(nextValue, meta),
      onDocumentInput: (meta) => inputs.onDocumentInputRef.current?.(meta),
      onMissingAttachmentResource: (attachmentId) => inputs.onMissingAttachmentResourceRef.current?.(attachmentId),
      onOpenExternalLink: (href) => inputs.onOpenExternalLinkRef.current?.(href),
      onOpenNodeLink: (title) => inputs.onOpenNodeLinkRef.current?.(title),
      onPreviewNodeLink: (request) => inputs.onPreviewNodeLinkRef.current?.(request),
      onPastedAnchors: (payload) => inputs.onPastedAnchorsRef.current?.(payload),
      readOnly: inputs.readOnlyRef.current,
      textAnchorDecorations: inputs.textAnchorDecorationsRef.current,
      trailingDivider: inputs.trailingDividerRef.current
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
  textAnchorDecorations: MarkdownEditorProps['textAnchorDecorations'],
  hideTitleHeading: boolean,
  onMissingAttachmentResource: MarkdownEditorProps['onMissingAttachmentResource'],
  onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | undefined,
  onOpenNodeLink: ((title: string) => void) | undefined,
  onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | undefined,
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'],
  readOnly: boolean | undefined,
  trailingDivider: boolean | undefined
) {
  const adapterRef = useRef<CodeMirrorEditorAdapter | null>(null);
  const inputs = useEditorAdapterInputs({
    hideTitleHeading,
    initialValue,
    localDocumentPath: localDocumentPath ?? null,
    onChange,
    onDocumentInput,
    onMissingAttachmentResource,
    onOpenExternalLink,
    onOpenNodeLink,
    onPreviewNodeLink,
    onPastedAnchors,
    onReady,
    readOnly,
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
