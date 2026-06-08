import { useEffect, useState } from 'react';

import {
  onWindowEscape,
  onWindowKeydown,
  type KeydownUnlisten
} from '../../../shared/platform/keyboard';

const FOREGROUND_DIALOG_SELECTOR = '[role="dialog"].z-modal:not([data-settings-root-dialog="true"])';
const NESTED_SETTINGS_DIALOG_SELECTOR = '[data-settings-nested-dialog="true"]';

export function useSettingsPreviewMode() {
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  useEffect(() => {
    if (!isPreviewActive) return undefined;
    let unlistenKeydown: KeydownUnlisten = () => {};
    const stopPreview = () => {
      setIsPreviewActive(false);
      unlistenKeydown();
    };
    unlistenKeydown = onWindowKeydown(stopPreview);
    window.addEventListener('pointerdown', stopPreview, { once: true });
    return () => {
      unlistenKeydown();
      window.removeEventListener('pointerdown', stopPreview);
    };
  }, [isPreviewActive]);

  return { isPreviewActive, setIsPreviewActive };
}

export function useSettingsPanelEscape(
  isPreviewActive: boolean,
  searchQueryRef: { current: string },
  onClose: () => void
) {
  useEffect(
    () =>
      onWindowEscape(() => {
        if (document.querySelector(FOREGROUND_DIALOG_SELECTOR) || document.querySelector(NESTED_SETTINGS_DIALOG_SELECTOR)) {
          return false;
        }
        if (searchQueryRef.current.trim().length > 0 || isPreviewActive) {
          return false;
        }
        onClose();
        return true;
      }),
    [isPreviewActive, onClose, searchQueryRef]
  );
}
