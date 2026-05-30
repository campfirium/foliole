import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';

import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import { EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS } from '../adapters/EditorAdapter';
import type { EditorTextAnchorDecoration } from '../adapters/EditorAdapter';

function areTextAnchorDecorationsEqual(
  left: readonly EditorTextAnchorDecoration[],
  right: readonly EditorTextAnchorDecoration[]
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
      !leftDecoration ||
      !rightDecoration ||
      leftDecoration.from !== rightDecoration.from ||
      leftDecoration.to !== rightDecoration.to ||
      leftDecoration.kind !== rightDecoration.kind
    ) {
      return false;
    }
  }
  return true;
}

export function useTextAnchorPresentationSync(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  textAnchorDecorations: readonly EditorTextAnchorDecoration[],
  value: string
) {
  const lastAppliedTextAnchorDecorationsRef = useRef(textAnchorDecorations);
  const deferredApplyFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (deferredApplyFrameRef.current !== null) {
      cancelAnimationFrame(deferredApplyFrameRef.current);
    }
  }, []);

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
