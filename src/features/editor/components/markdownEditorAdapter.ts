import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import { EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS, type EditorAdapter } from '../adapters/EditorAdapter';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import type { MarkdownEditorProps } from './markdownEditorTypes';

function resolveTextAnchorDecorations(textAnchorDecorations: MarkdownEditorProps['textAnchorDecorations']) {
  return textAnchorDecorations ?? EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS;
}

function areTextAnchorDecorationsEqual(
  left: readonly import('../adapters/EditorAdapter').EditorTextAnchorDecoration[],
  right: readonly import('../adapters/EditorAdapter').EditorTextAnchorDecoration[]
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
      leftDecoration.from !== rightDecoration.from ||
      leftDecoration.to !== rightDecoration.to ||
      leftDecoration.kind !== rightDecoration.kind
    ) {
      return false;
    }
  }
  return true;
}

function useTextAnchorPresentationSync(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  textAnchorDecorations: ReturnType<typeof resolveTextAnchorDecorations>,
  value: string
) {
  const lastAppliedTextAnchorDecorationsRef = useRef(textAnchorDecorations);
  const deferredApplyFrameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (deferredApplyFrameRef.current !== null) {
        cancelAnimationFrame(deferredApplyFrameRef.current);
      }
    },
    []
  );

  useLayoutEffect(() => {
    const adapter = adapterRef.current;
    if (areTextAnchorDecorationsEqual(lastAppliedTextAnchorDecorationsRef.current, textAnchorDecorations)) {
      return;
    }
    const applyTextAnchorDecorations = () => {
      lastAppliedTextAnchorDecorationsRef.current = textAnchorDecorations;
      adapterRef.current?.setTextAnchorDecorations?.(textAnchorDecorations);
    };
    if (!adapter || adapter.getContent() === value) {
      if (deferredApplyFrameRef.current !== null) {
        cancelAnimationFrame(deferredApplyFrameRef.current);
        deferredApplyFrameRef.current = null;
      }
      applyTextAnchorDecorations();
      return;
    }
    if (!areTextAnchorDecorationsEqual(lastAppliedTextAnchorDecorationsRef.current, EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS)) {
      lastAppliedTextAnchorDecorationsRef.current = EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS;
      adapter.setTextAnchorDecorations?.(EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS);
    }
    if (deferredApplyFrameRef.current !== null) {
      cancelAnimationFrame(deferredApplyFrameRef.current);
    }
    deferredApplyFrameRef.current = requestAnimationFrame(() => {
      deferredApplyFrameRef.current = null;
      if (adapterRef.current?.getContent() !== value) {
        return;
      }
      applyTextAnchorDecorations();
    });
  }, [adapterRef, textAnchorDecorations, value]);
}

function createEditorAdapter(args: {
  debugId: string | undefined;
  hideTitleHeading: boolean;
  host: HTMLDivElement;
  initialContent: string;
  onChange: MarkdownEditorProps['onChange'];
  onMissingAttachmentResource: MarkdownEditorProps['onMissingAttachmentResource'];
  onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | undefined;
  onOpenNodeLink: ((title: string) => void) | undefined;
  onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | undefined;
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'];
  readOnly: boolean | undefined;
  textAnchorDecorations: ReturnType<typeof resolveTextAnchorDecorations>;
  trailingDivider: boolean | undefined;
}) {
  const adapter = new CodeMirrorEditorAdapter(args.host, {
    hideTitleHeading: args.hideTitleHeading,
    initialContent: args.initialContent,
    onChange: args.onChange,
    onMissingAttachmentResource: args.onMissingAttachmentResource,
    onOpenExternalLink: args.onOpenExternalLink,
    onOpenNodeLink: args.onOpenNodeLink,
    onPreviewNodeLink: args.onPreviewNodeLink,
    onPastedAnchors: args.onPastedAnchors,
    readOnly: args.readOnly,
    textAnchorDecorations: args.textAnchorDecorations,
    trailingDivider: args.trailingDivider
  });
  if (args.debugId) {
    registerDebugEditorAdapter(args.debugId, adapter);
  }
  return adapter;
}

function useEditorAdapterInputs(args: {
  hideTitleHeading: boolean;
  initialValue: string;
  onChange: MarkdownEditorProps['onChange'];
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
  const onChangeRef = useRef(args.onChange);
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

  onChangeRef.current = args.onChange;
  onMissingAttachmentResourceRef.current = args.onMissingAttachmentResource;
  initialValueRef.current = args.initialValue;
  onOpenExternalLinkRef.current = args.onOpenExternalLink;
  onOpenNodeLinkRef.current = args.onOpenNodeLink;
  onPreviewNodeLinkRef.current = args.onPreviewNodeLink;
  onPastedAnchorsRef.current = args.onPastedAnchors;
  onReadyRef.current = args.onReady;
  hideTitleHeadingRef.current = args.hideTitleHeading;
  readOnlyRef.current = args.readOnly;
  trailingDividerRef.current = args.trailingDivider;
  textAnchorDecorationsRef.current = resolvedTextAnchorDecorations;

  return {
    hideTitleHeadingRef,
    initialValueRef,
    onChangeRef,
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

    const adapter = createEditorAdapter({
      debugId,
      hideTitleHeading: inputs.hideTitleHeadingRef.current,
      host,
      initialContent: inputs.initialValueRef.current,
      onChange: (nextValue, meta) => inputs.onChangeRef.current(nextValue, meta),
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
  onReady: ((adapter: EditorAdapter | null) => void) | undefined,
  initialValue: string,
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
    onChange,
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
    adapterRef.current?.setReadOnly?.(readOnly === true);
  }, [readOnly]);

  return adapterRef;
}
