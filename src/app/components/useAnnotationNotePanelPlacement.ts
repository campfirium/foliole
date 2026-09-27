import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';

import {
  clampPanelRect, panelViewport, readAnnotationPanelPreference,
  saveAnnotationPanelPreference, type AnnotationPanelPreference
} from './annotationNotePanelPlacement';

type PanelRect = ReturnType<typeof clampPanelRect>;

interface PointerInteractionState {
  cleanupRef: MutableRefObject<(() => void) | null>;
  preference: AnnotationPanelPreference;
  rect: PanelRect;
  setLiveRect: Dispatch<SetStateAction<PanelRect | null>>;
  setManualTop: Dispatch<SetStateAction<number | null>>;
  setPreference: Dispatch<SetStateAction<AnnotationPanelPreference>>;
}

function beginPanelPointerInteraction(
  kind: 'drag' | 'resize', event: ReactPointerEvent<HTMLElement>, state: PointerInteractionState
) {
  if (event.button !== 0) return;
  event.preventDefault();
  state.cleanupRef.current?.();
  const start = { clientX: event.clientX, clientY: event.clientY, rect: state.rect };
  let latest = state.rect;
  let moved = false;
  const move = (nextEvent: PointerEvent) => {
    if (nextEvent.pointerId !== event.pointerId) return;
    const dx = nextEvent.clientX - start.clientX;
    const dy = nextEvent.clientY - start.clientY;
    if (dx === 0 && dy === 0) return;
    moved = true;
    latest = clampPanelRect(kind === 'drag'
      ? { ...start.rect, x: start.rect.x + dx, y: start.rect.y + dy }
      : { ...start.rect, width: Math.max(190, start.rect.width + dx), height: Math.max(150, start.rect.height + dy) },
    panelViewport());
    state.setLiveRect(latest);
  };
  const finish = (nextEvent: PointerEvent) => {
    if (nextEvent.pointerId !== event.pointerId) return;
    state.cleanupRef.current?.();
    state.cleanupRef.current = null;
    if (!moved) return;
    const next: AnnotationPanelPreference = kind === 'drag'
      ? { ...state.preference, x: latest.x }
      : { ...state.preference, width: latest.width, height: latest.height };
    state.setPreference(next);
    if (kind === 'drag') state.setManualTop(latest.y);
    state.setLiveRect(null);
    saveAnnotationPanelPreference(next);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  state.cleanupRef.current = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
  };
}

export function useAnnotationNotePanelPlacement(left: number, top: number) {
  const [preference, setPreference] = useState(readAnnotationPanelPreference);
  const [viewport, setViewport] = useState(panelViewport);
  const [manualTop, setManualTop] = useState<number | null>(null);
  const [liveRect, setLiveRect] = useState<PanelRect | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const update = () => setViewport(panelViewport());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    setManualTop(null);
    setLiveRect(null);
  }, [left, top]);
  useEffect(() => () => cleanupRef.current?.(), []);

  const rect = clampPanelRect(liveRect ?? {
    x: preference.x ?? left,
    y: manualTop ?? top,
    width: preference.width,
    height: preference.height
  }, viewport);

  function followSelection() {
    const next = { ...preference, x: null };
    setPreference(next);
    setManualTop(null);
    setLiveRect(null);
    saveAnnotationPanelPreference(next);
  }

  function beginPointerInteraction(kind: 'drag' | 'resize', event: ReactPointerEvent<HTMLElement>) {
    beginPanelPointerInteraction(kind, event, {
      cleanupRef, preference, rect, setLiveRect, setManualTop, setPreference
    });
  }

  return { rect, pinned: preference.x !== null, followSelection, beginPointerInteraction };
}
