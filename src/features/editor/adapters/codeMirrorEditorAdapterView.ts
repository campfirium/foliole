import type { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createEmptyDecorationsEffect } from './codeMirrorEditorAdapterSupport';
import {
  alignSelectionInViewport,
  isPositionNearViewportRatio,
  resolvePositionViewportTop
} from './codeMirrorEditorSelectionAlignment';

export { alignSelectionInViewport, isPositionNearViewportRatio, resolvePositionViewportTop };

export function revealEditorPosition(view: EditorView, position: number) {
  view.dispatch({
    effects: EditorView.scrollIntoView(position, { y: 'center' })
  });
  view.focus();
  alignSelectionInViewport(view, position);
}

export function subscribeToEditorScroll(view: EditorView, listener: () => void) {
  let frameId: number | null = null;
  const handleScroll = () => {
    if (frameId !== null) {
      return;
    }
    frameId = requestAnimationFrame(() => {
      frameId = null;
      listener();
    });
  };
  view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });
  return () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
    view.scrollDOM.removeEventListener('scroll', handleScroll);
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
  return {
    clientHeight: view.scrollDOM.clientHeight,
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
