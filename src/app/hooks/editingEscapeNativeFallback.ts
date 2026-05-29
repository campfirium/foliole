import { onWindowEscape } from '../../shared/platform/keyboard';

interface EditingEscapeNativeFallbackArgs {
  exitEditing: () => void;
  isDialogOpen: () => boolean;
  isEditing: () => boolean;
}

export function onEditingEscapeNativeFallback(args: EditingEscapeNativeFallbackArgs) {
  return onWindowEscape(() => {
    if (args.isDialogOpen() || !args.isEditing()) {
      return false;
    }
    args.exitEditing();
    return true;
  });
}
