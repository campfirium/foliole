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

interface GestureInteractionState extends GestureTrackingState {
  gestureIntent: boolean;
  interactionRect: DOMRect;
  pendingContextMenu: {
    event: ReactMouseEvent<HTMLDivElement>;
    open: (event: ReactMouseEvent<HTMLDivElement>) => void;
  } | null;
}

interface GestureLifecycleArgs {
  bindings: EditorMouseGestureBinding[];
  hostRef: React.MutableRefObject<HTMLDivElement | null>;
  runCommand: (commandId: string) => void;
  settings: EditorMouseGestureSettings;
  setDirections: React.Dispatch<React.SetStateAction<GestureTrackingState['directions']>>;
  setTrail: React.Dispatch<React.SetStateAction<GestureTrailState | null>>;
  suppressNextContextMenuRef: React.MutableRefObject<boolean>;
  trackingRef: React.MutableRefObject<GestureInteractionState | null>;
}

function isPointInsideRect(rect: DOMRect, clientX: number, clientY: number) {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function clearInteraction(args: GestureLifecycleArgs) {
  args.trackingRef.current = null;
  args.suppressNextContextMenuRef.current = false;
  args.setTrail(null);
  args.setDirections([]);
}

function discardInteraction(args: GestureLifecycleArgs) {
  args.trackingRef.current = null;
  args.suppressNextContextMenuRef.current = false;
}

function createMouseMoveHandler(args: GestureLifecycleArgs) {
  return (event: MouseEvent) => {
    const tracking = args.trackingRef.current;
    if (!tracking) return;
    if ((event.buttons & 2) !== 2) {
      clearInteraction(args);
      return;
    }
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
    tracking.gestureIntent = true;
    syncGestureTrail(
      args.hostRef.current,
      event.clientX,
      event.clientY,
      args.settings,
      args.setTrail
    );
    args.setDirections([...tracking.directions]);
  };
}

function createMouseUpHandler(args: GestureLifecycleArgs) {
  return (event: MouseEvent) => {
    if (event.button !== 2) return;
    const tracking = args.trackingRef.current;
    clearInteraction(args);
    if (!tracking) return;
    if (!isPointInsideRect(tracking.interactionRect, event.clientX, event.clientY)) return;
    if (!tracking.gestureIntent) {
      tracking.pendingContextMenu?.open(tracking.pendingContextMenu.event);
      return;
    }
    args.suppressNextContextMenuRef.current = true;
    const gesture = resolveEditorMouseGesture(tracking.directions, args.bindings);
    const commandId = resolveEditorMouseGestureCommand(args.bindings, gesture);
    if (!commandId) return;
    event.preventDefault();
    args.runCommand(commandId);
  };
}

function useWindowGestureLifecycle(args: GestureLifecycleArgs) {
  useEffect(() => {
    const handleMouseMove = createMouseMoveHandler(args);
    const handleMouseUp = createMouseUpHandler(args);
    const handleClear = () => clearInteraction(args);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClear();
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleClear);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleClear);
      window.removeEventListener('keydown', handleKeyDown);
      discardInteraction(args);
    };
  }, [
    args.bindings,
    args.hostRef,
    args.runCommand,
    args.settings.segmentThresholdPx,
    args.settings.trailColor,
    args.settings.trailLineWidth,
    args.settings.trailOpacity,
    args.settings.trailPointThresholdPx,
    args.settings.trailVisible
  ]);
}

function arbitrateContextMenu(
  event: ReactMouseEvent<HTMLDivElement>,
  onContextMenu: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined,
  enabled: boolean,
  suppressNextContextMenuRef: React.MutableRefObject<boolean>,
  trackingRef: React.MutableRefObject<GestureInteractionState | null>
) {
  if (!enabled) {
    onContextMenu?.(event);
    return;
  }
  if (suppressNextContextMenuRef.current) {
    suppressNextContextMenuRef.current = false;
    event.preventDefault();
    return;
  }
  const tracking = trackingRef.current;
  if (!tracking) {
    onContextMenu?.(event);
    return;
  }
  event.preventDefault();
  if (!tracking.gestureIntent && onContextMenu) {
    tracking.pendingContextMenu = { event, open: onContextMenu };
  }
}

export function useEditorMouseGesture(
  hostRef: React.MutableRefObject<HTMLDivElement | null>,
  bindings: EditorMouseGestureBinding[],
  settings: EditorMouseGestureSettings
) {
  const { runCommand } = usePublicCommands();
  const trackingRef = useRef<GestureInteractionState | null>(null);
  const suppressNextContextMenuRef = useRef(false);
  const [directions, setDirections] = useState<GestureTrackingState['directions']>([]);
  const [trail, setTrail] = useState<GestureTrailState | null>(null);

  useWindowGestureLifecycle({
    bindings,
    hostRef,
    runCommand,
    settings,
    setDirections,
    setTrail,
    suppressNextContextMenuRef,
    trackingRef
  });

  const handleMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 2 || !settings.enabled) return;
    trackingRef.current = {
      directions: [],
      gestureIntent: false,
      interactionRect: event.currentTarget.getBoundingClientRect(),
      lastPoint: { x: event.clientX, y: event.clientY },
      pendingContextMenu: null
    };
    suppressNextContextMenuRef.current = false;
    setDirections([]);
    syncGestureTrail(hostRef.current, event.clientX, event.clientY, settings, setTrail);
  };

  const handleContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void
  ) => {
    arbitrateContextMenu(
      event,
      onContextMenu,
      settings.enabled,
      suppressNextContextMenuRef,
      trackingRef
    );
  };

  return {
    directions: settings.hintVisible ? directions : [],
    handleContextMenu,
    handleMouseDownCapture,
    trail
  };
}
