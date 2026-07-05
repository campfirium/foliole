import { useEffect } from 'react';

import { onWindowEscape } from './keyboard';

export function useDismissibleSurface(args: {
  enabled?: boolean;
  onDismiss: () => void;
  shouldDismiss?: (event: KeyboardEvent) => boolean;
}) {
  const { enabled = true, onDismiss, shouldDismiss } = args;

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    return onWindowEscape((event) => {
      if (shouldDismiss?.(event) === false) {
        return false;
      }
      onDismiss();
      return true;
    });
  }, [enabled, onDismiss, shouldDismiss]);
}
