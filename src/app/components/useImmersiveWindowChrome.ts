import { useEffect } from 'react';

import { setMainWindowNativeControlsVisible } from '../../shared/platform/windowControls';

function syncNativeControlsVisibility(visible: boolean) {
  void setMainWindowNativeControlsVisible(visible).catch((error) => {
    console.error('[immersive-reading] native window controls update failed', error);
  });
}

export function useImmersiveWindowChrome(isImmersiveMode: boolean) {
  useEffect(() => {
    syncNativeControlsVisibility(!isImmersiveMode);
  }, [isImmersiveMode]);

  useEffect(
    () => () => {
      syncNativeControlsVisibility(true);
    },
    []
  );
}
