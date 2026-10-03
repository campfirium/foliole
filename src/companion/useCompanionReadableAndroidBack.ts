import { useEffect } from 'react';

import { COMPANION_ANDROID_BACK_EVENT } from './companionAndroidBackEvent';

export function useCompanionReadableAndroidBack(args: {
  editing: boolean;
  selectionOpen: boolean;
  closeSelection(): void;
  exit(): void;
  finishEditing(): Promise<void>;
}): void {
  useEffect(() => {
    const handleBack = (event: Event) => {
      event.preventDefault();
      if (args.selectionOpen) args.closeSelection();
      else if (args.editing) void args.finishEditing();
      else args.exit();
    };
    document.addEventListener(COMPANION_ANDROID_BACK_EVENT, handleBack);
    return () => document.removeEventListener(COMPANION_ANDROID_BACK_EVENT, handleBack);
  });
}
