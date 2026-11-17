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

type ReadingTouch = {
  editor: EditorAdapter;
  content: Element;
  from?: number | undefined;
  to?: number | undefined;
  longPressed: boolean;
};

function readingContent(target: EventTarget | null) {
  return target instanceof Element && !isCompanionArticleInteractiveTarget(target)
    ? target.closest('.cm-content') : null;
}

export function useCompanionAndroidReadingSelection(args: Args) {
  const latest = useRef(args);
  latest.current = args;
  const { enabled, nodeId, editorRef } = args;
  useEffect(() => {
    if (!enabled) return;
    let start: ReadingTouch | null = null;
    const handoff = () => {
      const gesture = start;
      if (!gesture || gesture.editor !== editorRef.current) return;
      const payload = resolveCompanionSelectionCommandPayload(nodeId, gesture.editor);
      const range = payload?.entries.length === 1 ? payload.entries[0]?.range : undefined;
      if (!payload || !range || (gesture.from === range.from && gesture.to === range.to)) return;
      start = null;
      latest.current.accept(payload, window.getSelection()?.toString() ?? '');
      window.getSelection()?.removeAllRanges();
    };
    const release = subscribeAndroidReadingTouchRelease(() => {
      handoff();
      start = null;
    });
    if (!release) return;
    const touchStart = (event: TouchEvent) => {
      start = null;
      const editor = editorRef.current;
      const content = readingContent(event.target);
      if (!editor || event.touches.length !== 1 ||
        content?.closest('[data-companion-article-document]')?.getAttribute('data-node-id') !== nodeId) return;
      const previous = resolveCompanionSelectionCommandPayload(nodeId, editor)?.entries[0]?.range;
      start = { editor, content, from: previous?.from, to: previous?.to, longPressed: false };
    };
    const contextMenu = (event: MouseEvent) => {
      if (start && readingContent(event.target) === start.content) start.longPressed = true;
    };
    const touchCancel = (event: TouchEvent) => {
      // WebView takes control of the touch after the word has been selected. Its
      // native handles can become visible on finger-up, before the bridge event.
      if (start?.longPressed && readingContent(event.target) === start.content) handoff();
    };
    document.addEventListener('touchstart', touchStart, { capture: true, passive: true });
    document.addEventListener('contextmenu', contextMenu, true);
    document.addEventListener('touchcancel', touchCancel, true);
    return () => {
      release();
      document.removeEventListener('touchstart', touchStart, true);
      document.removeEventListener('contextmenu', contextMenu, true);
      document.removeEventListener('touchcancel', touchCancel, true);
    };
  }, [editorRef, enabled, nodeId]);
}
