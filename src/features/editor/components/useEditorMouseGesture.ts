import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { usePublicCommands } from '../../../shared/commands/publicCommandContext';
import {
  resolveEditorMouseGesture,
  resolveEditorMouseGestureCommand,
  type EditorMouseGestureBinding
} from '../model/editorMouseGestures';
import type { EditorMouseGestureSettings } from '../model/editorMouseGestureSettings';

import { arbitrateEditorGestureContextMenu } from './editorMouseGestureContextMenu';
import {
  appendTrackedGestureDirection,
  syncGestureTrail,
  type GestureTrackingState,
  type GestureTrailState
} from './editorMouseGestureTracking';

interface GestureInteractionState extends GestureTrackingState {
  gestureIntent: boolean;
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
  setHintPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setTrail: React.Dispatch<React.SetStateAction<GestureTrailState | null>>;
  suppressNextContextMenuRef: React.MutableRefObject<boolean>;
  trackingRef: React.MutableRefObject<GestureInteractionState | null>;
}

function clearInteraction(args: GestureLifecycleArgs) {
  args.trackingRef.current = null;
  args.suppressNextContextMenuRef.current = false;
  args.setTrail(null);
  args.setDirections([]);
  args.setHintPosition(null);
}

function discardInteraction(args: GestureLifecycleArgs) {
  args.trackingRef.current = null;
  args.suppressNextContextMenuRef.current = false;
}

function createMouseMoveHandler(args: GestureLifecycleArgs) {
  return (event: MouseEvent) => {
    const tracking = args.trackingRef.current;
    if (!tracking) return;
    const advanced = appendTrackedGestureDirection(
      tracking,
      event.clientX,
      event.clientY,
      args.settings.segmentThresholdPx
    );
    if (!advanced) {
      if (tracking.gestureIntent) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
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
    const tracking = args.trackingRef.current;
    if (!tracking) return;
    if (
      appendTrackedGestureDirection(
        tracking,
        event.clientX,
        event.clientY,
        args.settings.segmentThresholdPx
      )
    ) {
      tracking.gestureIntent = true;
    }
    clearInteraction(args);
    if (!tracking.gestureIntent) {
      tracking.pendingContextMenu?.open(tracking.pendingContextMenu.event);
      return;
    }
    args.suppressNextContextMenuRef.current = true;
    event.preventDefault();
    event.stopPropagation();
    const gesture = resolveEditorMouseGesture(tracking.directions, args.bindings);
    const commandId = resolveEditorMouseGestureCommand(args.bindings, gesture);
    if (!commandId) return;
    args.runCommand(commandId);
  };
}

function useWindowGestureLifecycle(args: GestureLifecycleArgs) {
  const argsRef = useRef(args);
  useLayoutEffect(() => {
    argsRef.current = args;
  });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => createMouseMoveHandler(argsRef.current)(event);
    const handleMouseUp = (event: MouseEvent) => createMouseUpHandler(argsRef.current)(event);
    const handleClear = () => clearInteraction(argsRef.current);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClear();
    };
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('blur', handleClear);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('blur', handleClear);
      window.removeEventListener('keydown', handleKeyDown);
      discardInteraction(argsRef.current);
    };
  }, []);

  useEffect(() => {
    if (!args.settings.enabled) clearInteraction(argsRef.current);
  }, [args.settings.enabled]);
}

export function useEditorMouseGesture(
  hostRef: React.MutableRefObject<HTMLDivElement | null>,
  bindings: EditorMouseGestureBinding[],
  settings: EditorMouseGestureSettings
) {
  const { items, runCommand } = usePublicCommands();
  const trackingRef = useRef<GestureInteractionState | null>(null);
  const suppressNextContextMenuRef = useRef(false);
  const [directions, setDirections] = useState<GestureTrackingState['directions']>([]);
  const [hintPosition, setHintPosition] = useState<{ x: number; y: number } | null>(null);
  const [trail, setTrail] = useState<GestureTrailState | null>(null);

  useWindowGestureLifecycle({
    bindings,
    hostRef,
    runCommand,
    settings,
    setDirections,
    setHintPosition,
    setTrail,
    suppressNextContextMenuRef,
    trackingRef
  });

  const handleMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 2 || !settings.enabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    trackingRef.current = {
      directions: [],
      gestureIntent: false,
      lastPoint: { x: event.clientX, y: event.clientY },
      pendingContextMenu: null
    };
    suppressNextContextMenuRef.current = false;
    setDirections([]);
    setHintPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    syncGestureTrail(hostRef.current, event.clientX, event.clientY, settings, setTrail);
  };

  const handleContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void
  ) => {
    arbitrateEditorGestureContextMenu(
      event,
      onContextMenu,
      settings.enabled,
      suppressNextContextMenuRef,
      trackingRef
    );
  };

  const activeGesture = resolveEditorMouseGesture(directions, bindings);
  const activeCommandId = resolveEditorMouseGestureCommand(bindings, activeGesture);
  const activeCommandTitle = items.find((item) => item.id === activeCommandId)?.title ?? null;

  return {
    activeCommandTitle,
    directions: settings.hintVisible ? directions : [],
    handleContextMenu,
    handleMouseDownCapture,
    hintPosition,
    trail
  };
}
