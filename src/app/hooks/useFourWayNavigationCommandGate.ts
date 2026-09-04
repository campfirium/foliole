import { useCallback, useEffect, useRef } from 'react';

import { isFourWayNavigationCommandId } from '../../../lib/core/nodes/fourWayNavigationCommands';

function hasOpenModalSurface() {
  return Boolean(document.querySelector(
    'dialog[open], [role="dialog"][aria-modal="true"]:not([data-state="closed"])'
  ));
}

export function useFourWayNavigationCommandGate(args: {
  isCommandSurfaceOpen: boolean;
  runCommand: (id: string) => void;
}) {
  const isComposingRef = useRef(false);

  useEffect(() => {
    const beginComposition = () => { isComposingRef.current = true; };
    const endComposition = () => { isComposingRef.current = false; };
    window.addEventListener('compositionstart', beginComposition, true);
    window.addEventListener('compositionend', endComposition, true);
    return () => {
      window.removeEventListener('compositionstart', beginComposition, true);
      window.removeEventListener('compositionend', endComposition, true);
    };
  }, []);

  return useCallback((commandId: string) => {
    if (
      isFourWayNavigationCommandId(commandId) &&
      (args.isCommandSurfaceOpen || isComposingRef.current || hasOpenModalSurface())
    ) {
      return;
    }
    args.runCommand(commandId);
  }, [args.isCommandSurfaceOpen, args.runCommand]);
}
