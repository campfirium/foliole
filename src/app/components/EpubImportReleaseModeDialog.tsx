import { EpubImportReleaseModeChoice } from '../../features/import/components/EpubImportReleaseModeChoice';
import { closeEpubImportReleaseModeDialog, useEpubImportReleaseModeDialogSnapshot } from '../hooks/epubImportReleaseModeDialogStore';

export function EpubImportReleaseModeDialog() {
  const snapshot = useEpubImportReleaseModeDialogSnapshot();
  return snapshot ? <EpubImportReleaseModeChoice fileName={snapshot.file.fileName}
    onClose={() => closeEpubImportReleaseModeDialog(null)} onSelect={closeEpubImportReleaseModeDialog} /> : null;
}
