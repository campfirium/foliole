import { useEffect } from 'react';

import { onWindowPriorityEscape } from '../../shared/platform/keyboard';

export function useDiscoursePublishDialogEscape(args: {
  onClose: () => void;
  onClosePanels: () => void;
  panelsOpen: boolean;
  state: 'idle' | 'publishing';
}) {
  const { onClose, onClosePanels, panelsOpen, state } = args;
  useEffect(() => onWindowPriorityEscape(() => {
    if (state !== 'idle') return true;
    if (panelsOpen) {
      onClosePanels();
      return true;
    }
    onClose();
    return true;
  }), [onClose, onClosePanels, panelsOpen, state]);
}
