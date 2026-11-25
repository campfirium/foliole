import { useCallback, useEffect, useRef, type RefObject } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';

import { useCompanionArticleScrollPosition } from './useCompanionArticleScrollPosition';

/** Fraction of the reading surface height whose text line anchors the position across the toggle. */
export const EDIT_TOGGLE_ANCHOR_RATIO = 0.25;
const ANCHOR_LIFETIME_MS = 3000;
const MAX_ALIGN_FRAMES = 20;
const STABLE_FRAMES = 3;
const READER_INPUT_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown', 'beforeinput'] as const;

type Anchor = { atStart: boolean; editing: boolean; expiresAt: number; offset: number; position: number };

function readAnchor(editor: EditorAdapter, surface: HTMLElement, editing: boolean): Anchor | null {
  const rect = surface.getBoundingClientRect();
  if (rect.height <= 0) return null;
  const position = editor.getDocumentPositionAtViewportY(rect.top + rect.height * EDIT_TOGGLE_ANCHOR_RATIO);
  if (position === null) return null;
  const top = editor.getPositionViewportTop?.(position);
  if (top === null || top === undefined) return null;
  return { atStart: surface.scrollTop <= 0, editing, expiresAt: performance.now() + ANCHOR_LIFETIME_MS,
    offset: top - rect.top, position };
}

/**
 * Scrolls until the anchored line sits still, and again after every window resize: the keyboard may open
 * or close long after the editor is ready. A reader who was at the start of the document stays there, so
 * the first line never slides under the editing toolbar.
 */
function followAnchor(editor: EditorAdapter, surface: HTMLElement, target: Anchor, isCurrent: () => boolean) {
  let frame: number | null = null;
  let frames = 0;
  let stable = 0;
  const align = () => {
    frame = null;
    const top = editor.getPositionViewportTop?.(target.position);
    if (top === null || top === undefined || !isCurrent()) return;
    const delta = target.atStart ? -surface.scrollTop : top - (surface.getBoundingClientRect().top + target.offset);
    if (Math.abs(delta) > 1) {
      surface.scrollTop += delta;
      stable = 0;
    } else {
      stable += 1;
    }
    frames += 1;
    if (stable < STABLE_FRAMES && frames < MAX_ALIGN_FRAMES) frame = requestAnimationFrame(align);
  };
  const cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const realign = () => {
    if (!isCurrent() || target.expiresAt < performance.now()) return;
    cancel();
    frames = 0;
    stable = 0;
    frame = requestAnimationFrame(align);
  };
  const viewport = window.visualViewport;
  window.addEventListener('resize', realign);
  viewport?.addEventListener('resize', realign);
  align();
  return () => {
    cancel();
    window.removeEventListener('resize', realign);
    viewport?.removeEventListener('resize', realign);
  };
}

/**
 * Entering or leaving content editing remounts the article editor, which collapses the outer reading
 * surface and resets its scroll. Keep the line the reader was looking at at the same height instead.
 */
export function useCompanionEditToggleScrollAnchor(surfaceRef: RefObject<HTMLElement | null>) {
  const anchor = useRef<Anchor | null>(null);
  const following = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    following.current?.();
    following.current = null;
  }, []);

  useEffect(() => {
    const release = () => { anchor.current = null; stop(); };
    for (const type of READER_INPUT_EVENTS) document.addEventListener(type, release, { capture: true, passive: true });
    return () => {
      for (const type of READER_INPUT_EVENTS) document.removeEventListener(type, release, { capture: true });
      stop();
    };
  }, [stop]);

  const capture = useCallback((editor: EditorAdapter | null, editing: boolean) => {
    stop();
    const surface = surfaceRef.current;
    anchor.current = editor && surface ? readAnchor(editor, surface, editing) : null;
  }, [stop, surfaceRef]);

  const onEditorReady = useCallback((editor: EditorAdapter | null) => {
    const target = anchor.current;
    if (!editor || !target) return;
    if (target.expiresAt < performance.now()) { anchor.current = null; return; }
    stop();
    if (target.editing) {
      // Place the caret on the anchored line so focusing the editor or opening the keyboard keeps it in view.
      editor.setSelection({ from: target.position, to: target.position });
      editor.focus();
    }
    const surface = surfaceRef.current;
    if (surface) following.current = followAnchor(editor, surface, target, () => anchor.current === target);
  }, [stop, surfaceRef]);

  return { capture, onEditorReady };
}

export type CompanionEditToggleScrollAnchor = ReturnType<typeof useCompanionEditToggleScrollAnchor>;

/** The article surface's persisted scroll position plus the anchor that carries it across edit toggles. */
export function useCompanionArticleEditScroll(args: Parameters<typeof useCompanionArticleScrollPosition>[0]) {
  const scrollPosition = useCompanionArticleScrollPosition(args);
  const scrollAnchor = useCompanionEditToggleScrollAnchor(scrollPosition.surfaceRef);
  return { scrollAnchor, scrollPosition };
}

/** Forwards editor readiness to the selection toolbar first, then aligns any pending toggle anchor. */
export function useCompanionAnchoredEditorReady(handleEditorReady: (editor: EditorAdapter | null) => void,
  scrollAnchor: CompanionEditToggleScrollAnchor) {
  const { onEditorReady } = scrollAnchor;
  return useCallback((editor: EditorAdapter | null) => {
    handleEditorReady(editor);
    onEditorReady(editor);
  }, [handleEditorReady, onEditorReady]);
}
