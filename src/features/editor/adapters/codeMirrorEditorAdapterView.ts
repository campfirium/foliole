import type { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { alignScrollTopToViewportRatio } from '../model/scrollAlignment';

import { createEmptyDecorationsEffect } from './codeMirrorEditorAdapterSupport';

export function alignSelectionInViewport(view: EditorView, position: number) {
  requestAnimationFrame(() => {
    const scroller = view.scrollDOM;
    const cursorRect = view.coordsAtPos(position) ?? view.coordsAtPos(position, -1);
    if (!cursorRect) {
      return;
    }

    const viewportRect = scroller.getBoundingClientRect();
    scroller.scrollTop = alignScrollTopToViewportRatio({
      currentScrollTop: scroller.scrollTop,
      cursorViewportTop: cursorRect.top,
      scrollHeight: scroller.scrollHeight,
      viewportHeight: scroller.clientHeight,
      viewportTop: viewportRect.top
    });
  });
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
