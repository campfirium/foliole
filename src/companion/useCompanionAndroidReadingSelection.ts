import { useEffect, useRef, type RefObject } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { subscribeAndroidReadingTouchRelease } from '../shared/platform/companion/reading/androidReadingTouchRelease';

import { resolveCompanionSelectionCommandPayload } from './companionSelectionCommandPayload';
import { isCompanionArticleInteractiveTarget } from './companionSelectionToolbarDom';

import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

interface Args {
  enabled: boolean;
  nodeId: string;
  editorRef: RefObject<EditorAdapter | null>;
  accept: (payload: SelectionCommandPayload, nativeText: string) => void;
}

export function useCompanionAndroidReadingSelection(args: Args) {
  const latest = useRef(args);
  latest.current = args;
  const { enabled, nodeId, editorRef } = args;
  useEffect(() => {
    if (!enabled) return;
    let start: { editor: EditorAdapter; from?: number | undefined; to?: number | undefined } | null = null;
    const release = subscribeAndroidReadingTouchRelease(() => {
      const gesture = start;
      start = null;
      if (!gesture || gesture.editor !== editorRef.current) return;
      const payload = resolveCompanionSelectionCommandPayload(nodeId, gesture.editor);
      const range = payload?.entries.length === 1 ? payload.entries[0]?.range : undefined;
      if (!payload || !range || (gesture.from === range.from && gesture.to === range.to)) return;
      latest.current.accept(payload, window.getSelection()?.toString() ?? '');
      window.getSelection()?.removeAllRanges();
    });
    if (!release) return;
    const touchStart = (event: TouchEvent) => {
      start = null;
      const editor = editorRef.current;
      const target = event.target;
      if (!editor || event.touches.length !== 1 || !(target instanceof Element) ||
        isCompanionArticleInteractiveTarget(target) || !target.closest('.cm-content') ||
        target.closest('[data-companion-article-document]')?.getAttribute('data-node-id') !== nodeId) return;
      const previous = resolveCompanionSelectionCommandPayload(nodeId, editor)?.entries[0]?.range;
      start = { editor, from: previous?.from, to: previous?.to };
    };
    document.addEventListener('touchstart', touchStart, { capture: true, passive: true });
    return () => {
      release();
      document.removeEventListener('touchstart', touchStart, true);
    };
  }, [editorRef, enabled, nodeId]);
}
