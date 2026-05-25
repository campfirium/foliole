import { useEffect } from 'react';

import { onWindowEscape } from '../../shared/platform/keyboard';

export function useFloatingPaletteEscape(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    return onWindowEscape(() => {
      onClose();
    });
  }, [isOpen, onClose]);
}
