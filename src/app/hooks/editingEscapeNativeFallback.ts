import { getElectronAPI } from '../../shared/platform/electronApi';

interface EditingEscapeNativeFallbackArgs {
  exitEditing: () => void;
  isDialogOpen: () => boolean;
  isEditing: () => boolean;
}

export function onEditingEscapeNativeFallback(args: EditingEscapeNativeFallbackArgs) {
  return getElectronAPI()?.onNativeKeyboardInput?.((payload) => {
    if (payload.type !== 'keyDown' || payload.key !== 'Escape') {
      return;
    }
    if (args.isDialogOpen() || !args.isEditing()) {
      return;
    }
    args.exitEditing();
  }) ?? (() => undefined);
}
