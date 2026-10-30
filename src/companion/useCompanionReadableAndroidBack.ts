import { useEffect } from 'react';

import { COMPANION_ANDROID_BACK_EVENT } from './companionAndroidBackEvent';
import { applyCompanionFlowAndroidBack } from './companionFlowAndroidBack';
import { useCompanionFlowHistoryControls } from './CompanionFlowHistoryContext';

export function useCompanionReadableAndroidBack(args: {
  editing: boolean;
  selectionOpen: boolean;
  closeSelection(): void;
  exit(): void;
  finishEditing(): Promise<void>;
}): void {
  const flowHistory = useCompanionFlowHistoryControls();
  useEffect(() => {
    const handleBack = (event: Event) => {
      event.preventDefault();
      if (args.selectionOpen) args.closeSelection();
      else if (args.editing) void args.finishEditing();
      else if (!applyCompanionFlowAndroidBack(flowHistory)) args.exit();
    };
    document.addEventListener(COMPANION_ANDROID_BACK_EVENT, handleBack);
    return () => document.removeEventListener(COMPANION_ANDROID_BACK_EVENT, handleBack);
  });
}
