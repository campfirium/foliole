import { useEffect, type Dispatch, type SetStateAction } from 'react';

import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { onWindowKeydown } from '../../shared/platform/keyboard';

import { DOCUMENT_TOPIC_SEARCH_OPEN_EVENT } from './documentTopicSearchEvents';

export function useDocumentTopicSearchActivation(
  findShortcut: CommandShortcutSet | undefined,
  isSearchAvailable: boolean,
  setFocusRequestId: Dispatch<SetStateAction<number>>,
  setIsOpen: Dispatch<SetStateAction<boolean>>
) {
  useEffect(() => {
    const openSearch = () => {
      if (!isSearchAvailable) {
        return;
      }
      setIsOpen(true);
      setFocusRequestId((value) => value + 1);
    };

    const handleCommandOpen = () => openSearch();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSearchAvailable || !findShortcut || event.defaultPrevented || !matchesShortcutSet(event, findShortcut)) {
        return;
      }
      event.preventDefault();
      openSearch();
    };

    window.addEventListener(DOCUMENT_TOPIC_SEARCH_OPEN_EVENT, handleCommandOpen);
    const unlistenKeydown = onWindowKeydown(handleKeyDown);
    return () => {
      window.removeEventListener(DOCUMENT_TOPIC_SEARCH_OPEN_EVENT, handleCommandOpen);
      unlistenKeydown();
    };
  }, [findShortcut, isSearchAvailable, setFocusRequestId, setIsOpen]);
}
