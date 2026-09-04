import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import {
  appendTrackedGestureDirection,
  type GestureTrackingState
} from '../../../editor/components/editorMouseGestureTracking';
import type {
  EditorMouseGestureBinding,
  EditorMouseGestureDirection
} from '../../../editor/model/editorMouseGestures';
import {
  normalizeEditorMouseGestureDirections,
  toEditorMouseGestureId
} from '../../../editor/model/editorMouseGestures';

function resolveRecordedGesture(
  directions: EditorMouseGestureDirection[],
  bindings: EditorMouseGestureBinding[]
) {
  const normalized = normalizeEditorMouseGestureDirections(directions);
  if (!normalized.length) return null;
  const gestureId = toEditorMouseGestureId(normalized);
  return {
    existing: bindings.find((binding) => binding.gesture === gestureId),
    gestureId,
    normalized
  };
}

function createStartRecording(
  setCommandId: (commandId: string) => void,
  setDirections: (directions: EditorMouseGestureDirection[]) => void,
  setConflict: (conflict: EditorMouseGestureBinding | null) => void
) {
  return (commandId: string) => {
    setCommandId(commandId);
    setDirections([]);
    setConflict(null);
  };
}

function recordGestureMovement(args: {
  buttons: number;
  clientX: number;
  clientY: number;
  clearConflict: () => void;
  preventDefault: () => void;
  setDirections: (directions: EditorMouseGestureDirection[]) => void;
  threshold: number;
  trackingRef: MutableRefObject<GestureTrackingState | null>;
}) {
  const tracking = args.trackingRef.current;
  if (!tracking || (args.buttons & 2) !== 2) return;
  if (!appendTrackedGestureDirection(tracking, args.clientX, args.clientY, args.threshold)) return;
  args.preventDefault();
  args.setDirections([...tracking.directions]);
  args.clearConflict();
}

function useRecordingListeners(args: {
  active: boolean;
  cancel: () => void;
  clearConflict: () => void;
  setDirections: (directions: EditorMouseGestureDirection[]) => void;
  threshold: number;
  trackingRef: MutableRefObject<GestureTrackingState | null>;
}) {
  useEffect(() => {
    if (!args.active) return;
    const handleMove = (event: MouseEvent) => {
      recordGestureMovement({
        ...args,
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
        preventDefault: () => event.preventDefault()
      });
    };
    const handleUp = (event: MouseEvent) => {
      if (event.button === 2) args.trackingRef.current = null;
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') args.cancel();
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('blur', args.cancel);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('blur', args.cancel);
    };
  }, [args]);
}

function createDrawingHandlers(args: {
  clearConflict: () => void;
  setDirections: (directions: EditorMouseGestureDirection[]) => void;
  threshold: number;
  trackingRef: MutableRefObject<GestureTrackingState | null>;
}) {
  const beginDrawing = (event: ReactMouseEvent) => {
    if (event.button !== 2) return;
    event.preventDefault();
    args.setDirections([]);
    args.clearConflict();
    args.trackingRef.current = {
      directions: [],
      lastPoint: { x: event.clientX, y: event.clientY }
    };
  };
  const continueDrawing = (event: ReactMouseEvent) => recordGestureMovement({
    ...args,
    buttons: event.buttons,
    clientX: event.clientX,
    clientY: event.clientY,
    preventDefault: () => event.preventDefault()
  });
  const endDrawing = (event: ReactMouseEvent) => {
    if (event.button === 2) args.trackingRef.current = null;
  };
  return { beginDrawing, continueDrawing, endDrawing };
}

export function useMouseGestureRecorder(args: {
  bindings: EditorMouseGestureBinding[];
  onSave: (directions: EditorMouseGestureDirection[], commandId: string) => boolean;
  onReplace: (gestureId: string, commandId: string) => void;
  threshold: number;
}) {
  const [commandId, setCommandId] = useState<string | null>(null);
  const [directions, setDirections] = useState<EditorMouseGestureDirection[]>([]);
  const [conflict, setConflict] = useState<EditorMouseGestureBinding | null>(null);
  const trackingRef = useRef<GestureTrackingState | null>(null);
  const start = createStartRecording(setCommandId, setDirections, setConflict);
  const cancel = useCallback(() => {
    trackingRef.current = null;
    setCommandId(null);
    setDirections([]);
    setConflict(null);
  }, []);

  useRecordingListeners({
    active: Boolean(commandId),
    cancel,
    clearConflict: () => setConflict(null),
    setDirections,
    threshold: args.threshold,
    trackingRef
  });

  const drawing = createDrawingHandlers({
    clearConflict: () => setConflict(null),
    setDirections,
    threshold: args.threshold,
    trackingRef
  });
  const save = () => {
    if (!commandId) return;
    const recorded = resolveRecordedGesture(directions, args.bindings);
    if (!recorded) return;
    const { existing, gestureId, normalized } = recorded;
    if (existing?.commandId && conflict?.gesture !== gestureId) {
      setConflict(existing);
      return;
    }
    if (existing) {
      args.onReplace(gestureId, commandId);
      cancel();
      return;
    }
    if (args.onSave(normalized, commandId)) cancel();
  };

  return {
    beginDrawing: drawing.beginDrawing,
    cancel,
    commandId,
    conflict,
    continueDrawing: drawing.continueDrawing,
    directions,
    endDrawing: drawing.endDrawing,
    save,
    start
  };
}
