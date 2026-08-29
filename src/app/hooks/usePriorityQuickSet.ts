import { useCallback, useEffect, useRef, useState } from 'react';

import { formatShortcutSetLabel, matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { definedProps } from '../../shared/lib/definedProps';
import {
  type NativeKeydownPayload,
  onNativeKeydown,
  onWindowEscape,
  onWindowKeydownCapture
} from '../../shared/platform/keyboard';

const QUICK_SET_TIMEOUT_MS = 4000;

function isModifierOnlyKey(key: string) {
  return key === 'Alt' || key === 'Control' || key === 'Meta' || key === 'Shift';
}

function readPriorityDigit(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  return /^[0-9]$/.test(event.key) ? Number(event.key) : null;
}

function handlePriorityQuickSetKeydown(args: {
  activeNodeId: string | null;
  armTimeout: () => void;
  cancel: () => void;
  canEnter: boolean;
  enter: () => boolean;
  event: KeyboardEvent;
  isActive: boolean;
  onPriorityChange: (nodeId: string, priority: number) => void;
  shortcuts?: CommandShortcutSet;
}) {
  if (!args.isActive) {
    if (!args.canEnter || !args.shortcuts || !matchesShortcutSet(args.event, args.shortcuts)) {
      return;
    }
    args.event.preventDefault();
    args.enter();
    return;
  }

  if (args.event.key === 'Escape') {
    args.event.preventDefault();
    args.cancel();
    return;
  }

  const priority = readPriorityDigit(args.event);
  if (priority == null) {
    if (!isModifierOnlyKey(args.event.key)) {
      args.armTimeout();
    }
    return;
  }

  if (!args.activeNodeId) {
    args.cancel();
    return;
  }

  args.event.preventDefault();
  args.onPriorityChange(args.activeNodeId, priority);
  args.cancel();
}

interface UsePriorityQuickSetArgs {
  activeNodeId: string | null;
  blocked: boolean;
  onPriorityChange: (nodeId: string, priority: number) => void;
  shortcuts?: CommandShortcutSet;
}

function usePriorityQuickSetListeners(args: {
  activeNodeId: string | null;
  armTimeout: () => void;
  cancel: () => void;
  canEnter: boolean;
  enter: () => boolean;
  isActive: boolean;
  onPriorityChange: (nodeId: string, priority: number) => void;
  shortcuts?: CommandShortcutSet;
}) {
  useEffect(() => {
    if (!args.isActive) {
      return undefined;
    }
    return onWindowEscape(args.cancel);
  }, [args.cancel, args.isActive]);

  useEffect(
    () =>
      onWindowKeydownCapture((event) =>
        handlePriorityQuickSetKeydown({
          activeNodeId: args.activeNodeId,
          armTimeout: args.armTimeout,
          cancel: args.cancel,
          canEnter: args.canEnter,
          enter: args.enter,
          event,
          isActive: args.isActive,
          onPriorityChange: args.onPriorityChange,
          ...definedProps({ shortcuts: args.shortcuts })
        })
      ),
    [args]
  );

  useEffect(() => onNativeKeydown((payload) => {
    if (payload.type !== 'keyDown') return;
    handlePriorityQuickSetKeydown({
      activeNodeId: args.activeNodeId,
      armTimeout: args.armTimeout,
      cancel: args.cancel,
      canEnter: args.canEnter,
      enter: args.enter,
      event: createNativeKeyboardEvent(payload),
      isActive: args.isActive,
      onPriorityChange: args.onPriorityChange,
      ...definedProps({ shortcuts: args.shortcuts })
    });
  }), [args]);
}

function createNativeKeyboardEvent(payload: NativeKeydownPayload) {
  return new KeyboardEvent('keydown', {
    altKey: payload.altKey,
    code: payload.code,
    ctrlKey: payload.controlKey,
    key: payload.key,
    metaKey: payload.metaKey,
    shiftKey: payload.shiftKey
  });
}

export function usePriorityQuickSet({
  activeNodeId,
  blocked,
  onPriorityChange,
  shortcuts
}: UsePriorityQuickSetArgs) {
  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const wasBlockedRef = useRef(blocked);
  const canEnter = Boolean(activeNodeId) && !blocked;

  const clearTimer = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    setIsActive(false);
  }, [clearTimer]);

  const armTimeout = useCallback(() => {
    clearTimer();
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setIsActive(false);
    }, QUICK_SET_TIMEOUT_MS);
  }, [clearTimer]);

  const enter = useCallback(() => {
    if (!activeNodeId) {
      return false;
    }
    setIsActive(true);
    armTimeout();
    return true;
  }, [activeNodeId, armTimeout]);

  useEffect(() => {
    const becameBlocked = blocked && !wasBlockedRef.current;
    wasBlockedRef.current = blocked;
    if ((!activeNodeId || becameBlocked) && isActive) cancel();
  }, [activeNodeId, blocked, cancel, isActive]);

  useEffect(() => clearTimer, [clearTimer]);

  usePriorityQuickSetListeners({
    activeNodeId,
    armTimeout,
    cancel,
    canEnter,
    enter,
    isActive,
    onPriorityChange,
    ...definedProps({ shortcuts })
  });

  return { enter, isActive, shortcutLabel: shortcuts ? formatShortcutSetLabel(shortcuts) : '' };
}
