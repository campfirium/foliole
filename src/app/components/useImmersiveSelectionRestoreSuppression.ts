import { useEffect, useRef } from 'react';

import type { ImmersiveReadingModeSource } from './immersiveReadingModeTypes';

export function useImmersiveSelectionRestoreSuppression(
  props: Pick<ImmersiveReadingModeSource, 'isImmersiveMode'>
) {
  const shouldSuppressSelectionRestoreRef = useRef(false);
  useEffect(() => {
    shouldSuppressSelectionRestoreRef.current = false;
  }, [props.isImmersiveMode]);
  return {
    shouldSuppressSelectionRestore: () => shouldSuppressSelectionRestoreRef.current,
    suppressNextSelectionRestore: () => {
      shouldSuppressSelectionRestoreRef.current = true;
    }
  };
}
