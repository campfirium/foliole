import { getElectronAPI } from '../../shared/platform/electronApi';

interface EditingEscapeNativeFallbackArgs {
  exitEditing: () => void;
  isDialogOpen: () => boolean;
  isEditing: () => boolean;
}

export function onEditingEscapeNativeFallback(args: EditingEscapeNativeFallbackArgs) {
  // Electron can deliver Esc through the native bridge without a DOM keydown;
  // keep this direct editing exit path in addition to editor blur handlers.
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
