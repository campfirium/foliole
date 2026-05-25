import { getElectronAPI } from '../../shared/platform/electronApi';

interface EditingEscapeNativeFallbackArgs {
  exitEditing: () => void;
  isDialogOpen: () => boolean;
  isEditing: () => boolean;
}

export function onEditingEscapeNativeFallback(args: EditingEscapeNativeFallbackArgs) {
  const unsubscribe = getElectronAPI()?.onNativeKeyboardInput?.((payload) => {
    if (payload.type !== 'keyDown' || payload.key !== 'Escape' || args.isDialogOpen()) {
      return;
    }
    window.setTimeout(() => {
      if (!args.isDialogOpen() && args.isEditing()) {
        args.exitEditing();
      }
    }, 0);
  });
  return unsubscribe ?? (() => {});
}
