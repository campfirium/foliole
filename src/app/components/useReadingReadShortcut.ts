import { useEffect } from 'react';

import { getPlatformDefaultCommandShortcuts } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { getCommandShortcutOverrides, resolveCommandShortcutMap } from '../../shared/commands/keymap';
import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import { isEditableKeyboardTarget } from '../hooks/workspaceKeyboardTarget';

function getReadingReadShortcuts() {
  return resolveCommandShortcutMap({
    commandIds: [APP_COMMAND_IDS.readingReviewRead],
    defaults: getPlatformDefaultCommandShortcuts(),
    overrides: getCommandShortcutOverrides()
  })[APP_COMMAND_IDS.readingReviewRead];
}

export function useReadingReadShortcut(action: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        event.repeat ||
        isEditableKeyboardTarget(event.target) ||
        isEditableKeyboardTarget(document.activeElement) ||
        !matchesShortcutSet(event, getReadingReadShortcuts())
      ) {
        return;
      }
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [action]);
}
