import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { usePublicCommands } from '../../../shared/commands/publicCommandContext';
import {
  resolveEditorMouseGesture,
  resolveEditorMouseGestureCommand,
  type EditorMouseGestureBinding
} from '../model/editorMouseGestures';
import type { EditorMouseGestureSettings } from '../model/editorMouseGestureSettings';

import {
  appendTrackedGestureDirection,
  syncGestureTrail,
  type GestureTrackingState,
  type GestureTrailState
} from './editorMouseGestureTracking';

function createWindowHandlers(args: {
  bindings: EditorMouseGestureBinding[];
  hostRef: React.MutableRefObject<HTMLDivElement | null>;
  runCommand: (commandId: string) => void;
  settings: EditorMouseGestureSettings;
  setDirections: React.Dispatch<React.SetStateAction<GestureTrackingState['directions']>>;
  setTrail: React.Dispatch<React.SetStateAction<GestureTrailState | null>>;
  suppressNextContextMenuRef: React.MutableRefObject<boolean>;
  trackingRef: React.MutableRefObject<GestureTrackingState | null>;
}) {
  const handleMouseMove = (event: MouseEvent) => {
    const tracking = args.trackingRef.current;
    if (!tracking || (event.buttons & 2) !== 2) return;
    if (
      !appendTrackedGestureDirection(
        tracking,
        event.clientX,
        event.clientY,
        args.settings.segmentThresholdPx
      )
    )
      return;
    event.preventDefault();
    syncGestureTrail(
      args.hostRef.current,
      event.clientX,
      event.clientY,
      args.settings,
      args.setTrail
    );
    args.setDirections([...tracking.directions]);
    const gesture = resolveEditorMouseGesture(tracking.directions, args.bindings);
    if (resolveEditorMouseGestureCommand(args.bindings, gesture))
      args.suppressNextContextMenuRef.current = true;
  };
  const handleMouseUp = (event: MouseEvent) => {
    if (event.button !== 2) return;
    const tracking = args.trackingRef.current;
    args.trackingRef.current = null;
    args.setTrail(null);
    args.setDirections([]);
    if (!tracking) return;
    const gesture = resolveEditorMouseGesture(tracking.directions, args.bindings);
    const commandId = resolveEditorMouseGestureCommand(args.bindings, gesture);
    if (!commandId) return;
    event.preventDefault();
    args.runCommand(commandId);
  };
  return { handleMouseMove, handleMouseUp };
}

export function useEditorMouseGesture(
  hostRef: React.MutableRefObject<HTMLDivElement | null>,
  bindings: EditorMouseGestureBinding[],
  settings: EditorMouseGestureSettings
) {
  const { runCommand } = usePublicCommands();
  const trackingRef = useRef<GestureTrackingState | null>(null);
  const suppressNextContextMenuRef = useRef(false);
  const [directions, setDirections] = useState<GestureTrackingState['directions']>([]);
  const [trail, setTrail] = useState<GestureTrailState | null>(null);

  useEffect(() => {
    const handlers = createWindowHandlers({
      bindings,
      hostRef,
      runCommand,
      settings,
      setDirections,
      setTrail,
      suppressNextContextMenuRef,
      trackingRef
    });
    window.addEventListener('mousemove', handlers.handleMouseMove);
    window.addEventListener('mouseup', handlers.handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handlers.handleMouseMove);
      window.removeEventListener('mouseup', handlers.handleMouseUp);
    };
  }, [bindings, hostRef, runCommand, settings]);

  const handleMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 2 || !settings.enabled) return;
    trackingRef.current = { directions: [], lastPoint: { x: event.clientX, y: event.clientY } };
    suppressNextContextMenuRef.current = false;
    setDirections([]);
    syncGestureTrail(hostRef.current, event.clientX, event.clientY, settings, setTrail);
  };

  const handleContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void
  ) => {
    if (suppressNextContextMenuRef.current) {
      suppressNextContextMenuRef.current = false;
      event.preventDefault();
      return;
    }
    onContextMenu?.(event);
  };

  return {
    directions: settings.hintVisible ? directions : [],
    handleContextMenu,
    handleMouseDownCapture,
    trail
  };
}
