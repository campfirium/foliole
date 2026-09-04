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
import { validateCustomEditorMouseGesture } from '../../../editor/model/editorMouseGestures';

export type MouseGestureRecordingError = 'conflict' | 'too-short' | null;

function useRecordingListeners(args: {
  active: boolean;
  cancel: () => void;
  setDirections: (directions: EditorMouseGestureDirection[]) => void;
  setError: (error: MouseGestureRecordingError) => void;
  threshold: number;
  trackingRef: MutableRefObject<GestureTrackingState | null>;
}) {
  useEffect(() => {
    if (!args.active) return;
    const handleMove = (event: MouseEvent) => {
      const tracking = args.trackingRef.current;
      if (!tracking || (event.buttons & 2) !== 2) return;
      if (!appendTrackedGestureDirection(tracking, event.clientX, event.clientY, args.threshold))
        return;
      event.preventDefault();
      args.setDirections([...tracking.directions]);
      args.setError(null);
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

export function useMouseGestureRecorder(args: {
  bindings: EditorMouseGestureBinding[];
  onSave: (directions: EditorMouseGestureDirection[], commandId: string) => boolean;
  threshold: number;
}) {
  const [commandId, setCommandId] = useState<string | null>(null);
  const [directions, setDirections] = useState<EditorMouseGestureDirection[]>([]);
  const [error, setError] = useState<MouseGestureRecordingError>(null);
  const trackingRef = useRef<GestureTrackingState | null>(null);
  const cancel = useCallback(() => {
    trackingRef.current = null;
    setCommandId(null);
    setDirections([]);
    setError(null);
  }, []);

  useRecordingListeners({
    active: Boolean(commandId),
    cancel,
    setDirections,
    setError,
    threshold: args.threshold,
    trackingRef
  });

  const beginDrawing = (event: ReactMouseEvent) => {
    if (event.button !== 2) return;
    event.preventDefault();
    setDirections([]);
    setError(null);
    trackingRef.current = { directions: [], lastPoint: { x: event.clientX, y: event.clientY } };
  };
  const save = () => {
    if (!commandId) return;
    const validation = validateCustomEditorMouseGesture(directions, args.bindings);
    if (validation !== 'valid') {
      setError(validation);
      return;
    }
    if (args.onSave(directions, commandId)) cancel();
  };

  return {
    beginDrawing,
    cancel,
    commandId,
    directions,
    error,
    save,
    start: (nextCommandId: string) => {
      setCommandId(nextCommandId);
      setDirections([]);
      setError(null);
    }
  };
}
