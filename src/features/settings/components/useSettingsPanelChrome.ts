import { useEffect, useState } from 'react';

import {
  onWindowEscape,
  onWindowKeydown,
  type KeydownUnlisten
} from '../../../shared/platform/keyboard';

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
        if (searchQueryRef.current.trim().length > 0 || isPreviewActive) {
          return false;
        }
        onClose();
      }),
    [isPreviewActive, onClose, searchQueryRef]
  );
}
