import type { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createEmptyDecorationsEffect } from './codeMirrorEditorAdapterSupport';
import {
  alignSelectionInViewport,
  isPositionNearViewportRatio,
  resolvePositionViewportTop
} from './codeMirrorEditorSelectionAlignment';
import type { EditorScrollEvent } from './EditorAdapter';

export { alignSelectionInViewport, isPositionNearViewportRatio, resolvePositionViewportTop };

export function revealEditorPosition(view: EditorView, position: number) {
  view.dispatch({
    effects: EditorView.scrollIntoView(position, { y: 'center' })
  });
  view.focus();
  alignSelectionInViewport(view, position);
}

const USER_SCROLL_INTENT_TIMEOUT_MS = 800;
const SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' '
]);

export function subscribeToEditorScroll(view: EditorView, listener: (event: EditorScrollEvent) => void) {
  let frameId: number | null = null;
  let userScrollIntentExpiresAt = 0;
  let pendingScrollWasUserInitiated = false;
  const markUserScrollIntent = () => {
    userScrollIntentExpiresAt = Date.now() + USER_SCROLL_INTENT_TIMEOUT_MS;
  };
  const isUserScrollIntentActive = () => Date.now() <= userScrollIntentExpiresAt;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!event.defaultPrevented && SCROLL_KEYS.has(event.key)) {
      markUserScrollIntent();
    }
  };
  const handleScroll = () => {
    pendingScrollWasUserInitiated = pendingScrollWasUserInitiated || isUserScrollIntentActive();
    if (frameId !== null) {
      return;
    }
    frameId = requestAnimationFrame(() => {
      const userInitiated = pendingScrollWasUserInitiated;
      frameId = null;
      pendingScrollWasUserInitiated = false;
      listener({ userInitiated });
    });
  };
  view.dom.addEventListener('keydown', handleKeyDown);
  view.scrollDOM.addEventListener('pointerdown', markUserScrollIntent, { passive: true });
  view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });
  view.scrollDOM.addEventListener('touchmove', markUserScrollIntent, { passive: true });
  view.scrollDOM.addEventListener('wheel', markUserScrollIntent, { passive: true });
  return () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
    view.dom.removeEventListener('keydown', handleKeyDown);
    view.scrollDOM.removeEventListener('pointerdown', markUserScrollIntent);
    view.scrollDOM.removeEventListener('scroll', handleScroll);
    view.scrollDOM.removeEventListener('touchmove', markUserScrollIntent);
    view.scrollDOM.removeEventListener('wheel', markUserScrollIntent);
  };
}

export function resolvePreferredViewportX(rect: { left: number; right: number; width: number }) {
  const safeWidth = Math.max(rect.width, 0);
  const leftInset = Math.min(Math.max(safeWidth * 0.08, 24), Math.max(24, safeWidth - 12));
  return Math.min(rect.left + leftInset, rect.right - 12);
}

export function resolveDocumentPositionAtViewportPoint(view: EditorView, clientX: number, clientY: number) {
  const positionAtCoords = view.posAtCoords({ x: clientX, y: clientY }, false);
  if (typeof positionAtCoords === 'number') {
    return positionAtCoords;
  }
  const documentY = clientY - view.documentTop;
  if (!Number.isFinite(documentY)) {
    return null;
  }
  try {
    return view.lineBlockAtHeight(documentY).from;
  } catch {
    return null;
  }
}

export function resolveDocumentPositionAtViewportY(view: EditorView, clientY: number) {
  const contentRect = view.contentDOM.getBoundingClientRect();
  return resolveDocumentPositionAtViewportPoint(view, resolvePreferredViewportX(contentRect), clientY);
}

export function readEditorScrollMetrics(view: EditorView) {
  const contentPaddingBottom = Number.parseFloat(getComputedStyle(view.contentDOM).paddingBottom);
  return {
    clientHeight: view.scrollDOM.clientHeight,
    contentPaddingBottom: Number.isFinite(contentPaddingBottom) ? contentPaddingBottom : 0,
    scrollHeight: view.scrollDOM.scrollHeight,
    scrollTop: view.scrollDOM.scrollTop
  };
}

export function reconfigureDecorationCompartment(args: {
  buildDecorations: () => ReturnType<typeof EditorView.decorations.of>;
  compartment: Compartment;
  fallbackLabel: string;
  view: EditorView;
}) {
  try {
    args.view.dispatch({
      effects: args.compartment.reconfigure(args.buildDecorations())
    });
  } catch (error) {
    console.error(args.fallbackLabel, error);
    args.view.dispatch({
      effects: createEmptyDecorationsEffect(args.compartment)
    });
  }
}
