import type { PdfReadingMode } from '../../features/settings/model/appearanceSettings';
import { requestCustomCopyDialogOpen } from '../../features/settings/model/customCopyDialogRequests';

interface PaletteSettingsCommandActionsArgs {
  clearSettingsRequest: () => void;
  openReadwiseReaderSettings: () => void;
  onSetPdfReadingMode: (value: PdfReadingMode) => void;
  onToggleBaseColorMode: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export function createPaletteSettingsActions(args: PaletteSettingsCommandActionsArgs) {
  return {
    closeSettings: () => {
      args.setSettingsOpen(false);
      args.clearSettingsRequest();
    },
    openCustomCopy: requestCustomCopyDialogOpen,
    openReadwiseReaderSettings: args.openReadwiseReaderSettings,
    openSettings: () => {
      args.clearSettingsRequest();
      args.setSettingsOpen(true);
    },
    setPdfReadingMode: args.onSetPdfReadingMode,
    toggleBaseColorMode: args.onToggleBaseColorMode
  };
}
