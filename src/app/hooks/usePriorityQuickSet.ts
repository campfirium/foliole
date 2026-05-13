import { useCallback, useEffect, useRef, useState } from 'react';

import { formatShortcutSetLabel, matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { definedProps } from '../../shared/lib/definedProps';
import { onWindowKeydown } from '../../shared/platform/keyboard';

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

export function usePriorityQuickSet({
  activeNodeId,
  blocked,
  onPriorityChange,
  shortcuts
}: UsePriorityQuickSetArgs) {
  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<number | null>(null);
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
    if (!canEnter) {
      return false;
    }
    setIsActive(true);
    armTimeout();
    return true;
  }, [armTimeout, canEnter]);

  useEffect(() => {
    if (!canEnter && isActive) cancel();
  }, [canEnter, cancel, isActive]);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(
    () =>
      onWindowKeydown((event) =>
        handlePriorityQuickSetKeydown({
          activeNodeId,
          armTimeout,
          cancel,
          canEnter,
          enter,
          event,
          isActive,
          onPriorityChange,
          ...definedProps({ shortcuts })
        })
      ),
    [activeNodeId, armTimeout, cancel, canEnter, enter, isActive, onPriorityChange, shortcuts]
  );

  return { enter, isActive, shortcutLabel: shortcuts ? formatShortcutSetLabel(shortcuts) : '' };
}
