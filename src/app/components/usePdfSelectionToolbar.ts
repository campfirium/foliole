import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

import { resolvePdfSelectionSnapshot, type PdfSelectionSnapshot } from './pdfSelectionRuntime';

const TOOLBAR_PRIMARY_ACTION_CENTER_OFFSET = 22;
const TOOLBAR_WIDTH = 48;

type PdfSelectionInteraction = { kind: 'idle' } | { kind: 'dragging' } | { kind: 'completed'; event: MouseEvent };
interface PdfSelectionToolbarInput {
  onClose: () => void;
  onOpen: (snapshot: PdfSelectionSnapshot, position: { left: number; top: number }) => void;
  surfaceRef: MutableRefObject<HTMLElement | null>;
}

function resolveToolbarPosition(event: MouseEvent | KeyboardEvent) {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = range && typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
  const pointerX = event instanceof MouseEvent ? event.clientX : null;
  const anchorX = pointerX && pointerX > 0 ? pointerX : (rect?.left ?? 8) + (rect?.width ?? 0) / 2;
  return {
    left: Math.max(8, Math.min(anchorX - TOOLBAR_PRIMARY_ACTION_CENTER_OFFSET, window.innerWidth - TOOLBAR_WIDTH - 8)),
    top: Math.max(8, (rect?.top ?? 54) - 46)
  };
}

function createToolbarHandlers(input: MutableRefObject<PdfSelectionToolbarInput>, surface: HTMLElement, interaction: MutableRefObject<PdfSelectionInteraction>) {
  const open = (event: MouseEvent | KeyboardEvent) => {
    const snapshot = resolvePdfSelectionSnapshot(surface);
    if (snapshot) input.current.onOpen(snapshot, resolveToolbarPosition(event));
  };
  const blur = () => { interaction.current = { kind: 'idle' }; };
  return {
    blur,
    down: (event: MouseEvent) => {
      if (event.button !== 0) return;
      blur();
      if (event.target instanceof Element && event.target.closest('[data-annotation-toolbar="true"]')) return;
      if (event.target instanceof Node && surface.contains(event.target)) interaction.current = { kind: 'dragging' };
      input.current.onClose();
    },
    up: (event: MouseEvent) => {
      if (event.button !== 0) return;
      const eligible = interaction.current.kind === 'dragging' || (event.target instanceof Node && surface.contains(event.target));
      blur();
      if (!eligible) return;
      interaction.current = { kind: 'completed', event };
      open(event);
    },
    selection: () => {
      if (interaction.current.kind === 'completed') open(interaction.current.event);
    },
    key: (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        blur();
        input.current.onClose();
      } else open(event);
    }
  };
}

export function usePdfSelectionToolbar(input: PdfSelectionToolbarInput) {
  const interaction = useRef<PdfSelectionInteraction>({ kind: 'idle' });
  const currentInput = useRef(input);
  currentInput.current = input;
  useEffect(() => {
    const surface = input.surfaceRef.current;
    if (!surface) return undefined;
    const handlers = createToolbarHandlers(currentInput, surface, interaction);
    document.addEventListener('mousedown', handlers.down, true);
    document.addEventListener('mouseup', handlers.up, true);
    document.addEventListener('selectionchange', handlers.selection);
    window.addEventListener('blur', handlers.blur);
    surface.addEventListener('keyup', handlers.key, true);
    return () => {
      document.removeEventListener('mousedown', handlers.down, true);
      document.removeEventListener('mouseup', handlers.up, true);
      document.removeEventListener('selectionchange', handlers.selection);
      window.removeEventListener('blur', handlers.blur);
      surface.removeEventListener('keyup', handlers.key, true);
    };
  }, [input.surfaceRef]);
}
