import { useLayoutEffect, useRef, type MutableRefObject } from 'react';

import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import { EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS, type EditorAdapter } from '../adapters/EditorAdapter';

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
  textAnchorDecorations: ReturnType<typeof resolveTextAnchorDecorations>
) {
  const lastAppliedTextAnchorDecorationsRef = useRef(textAnchorDecorations);

  useLayoutEffect(() => {
    if (areTextAnchorDecorationsEqual(lastAppliedTextAnchorDecorationsRef.current, textAnchorDecorations)) {
      return;
    }
    lastAppliedTextAnchorDecorationsRef.current = textAnchorDecorations;
    adapterRef.current?.setTextAnchorDecorations?.(textAnchorDecorations);
  }, [adapterRef, textAnchorDecorations]);
}

function createEditorAdapter(args: {
  debugId: string | undefined;
  hideTitleHeading: boolean;
  host: HTMLDivElement;
  initialContent: string;
  onChange: (value: string) => void;
  onOpenNodeLink: ((title: string) => void) | undefined;
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'];
  readOnly: boolean | undefined;
  textAnchorDecorations: ReturnType<typeof resolveTextAnchorDecorations>;
}) {
  const adapter = new CodeMirrorEditorAdapter(args.host, {
    hideTitleHeading: args.hideTitleHeading,
    initialContent: args.initialContent,
    onChange: args.onChange,
    onOpenNodeLink: args.onOpenNodeLink,
    onPastedAnchors: args.onPastedAnchors,
    readOnly: args.readOnly,
    textAnchorDecorations: args.textAnchorDecorations
  });
  if (args.debugId) {
    registerDebugEditorAdapter(args.debugId, adapter);
  }
  return adapter;
}

function useEditorAdapterInputs(args: {
  hideTitleHeading: boolean;
  initialValue: string;
  onChange: (value: string) => void;
  onOpenNodeLink: ((title: string) => void) | undefined;
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'];
  onReady: ((adapter: EditorAdapter | null) => void) | undefined;
  readOnly: boolean | undefined;
  textAnchorDecorations: MarkdownEditorProps['textAnchorDecorations'];
}) {
  const {
    hideTitleHeading,
    initialValue,
    onChange,
    onOpenNodeLink,
    onPastedAnchors,
    onReady,
    readOnly,
    textAnchorDecorations
  } = args;
  const initialValueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  const onOpenNodeLinkRef = useRef(onOpenNodeLink);
  const onPastedAnchorsRef = useRef(onPastedAnchors);
  const onReadyRef = useRef(onReady);
  const hideTitleHeadingRef = useRef(hideTitleHeading);
  const readOnlyRef = useRef(readOnly);
  const resolvedTextAnchorDecorations = resolveTextAnchorDecorations(textAnchorDecorations);
  const textAnchorDecorationsRef = useRef(resolvedTextAnchorDecorations);

  onChangeRef.current = onChange;
  initialValueRef.current = initialValue;
  onOpenNodeLinkRef.current = onOpenNodeLink;
  onPastedAnchorsRef.current = onPastedAnchors;
  onReadyRef.current = onReady;
  hideTitleHeadingRef.current = hideTitleHeading;
  readOnlyRef.current = readOnly;
  textAnchorDecorationsRef.current = resolvedTextAnchorDecorations;

  return {
    hideTitleHeadingRef,
    initialValueRef,
    onChangeRef,
    onOpenNodeLinkRef,
    onPastedAnchorsRef,
    onReadyRef,
    readOnlyRef,
    resolvedTextAnchorDecorations,
    textAnchorDecorationsRef
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
      onChange: (nextValue) => inputs.onChangeRef.current(nextValue),
      onOpenNodeLink: (title) => inputs.onOpenNodeLinkRef.current?.(title),
      onPastedAnchors: (payload) => inputs.onPastedAnchorsRef.current?.(payload),
      readOnly: inputs.readOnlyRef.current,
      textAnchorDecorations: inputs.textAnchorDecorationsRef.current
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
  onChange: (value: string) => void,
  onReady: ((adapter: EditorAdapter | null) => void) | undefined,
  initialValue: string,
  textAnchorDecorations: MarkdownEditorProps['textAnchorDecorations'],
  hideTitleHeading: boolean,
  onOpenNodeLink: ((title: string) => void) | undefined,
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'],
  readOnly: boolean | undefined
) {
  const adapterRef = useRef<CodeMirrorEditorAdapter | null>(null);
  const inputs = useEditorAdapterInputs({
    hideTitleHeading,
    initialValue,
    onChange,
    onOpenNodeLink,
    onPastedAnchors,
    onReady,
    readOnly,
    textAnchorDecorations
  });

  useEditorAdapterLifecycle({ adapterRef, debugId, hostRef, inputs });

  useTextAnchorPresentationSync(adapterRef, inputs.resolvedTextAnchorDecorations);

  useLayoutEffect(() => {
    adapterRef.current?.setReadOnly?.(readOnly === true);
  }, [readOnly]);

  return adapterRef;
}
