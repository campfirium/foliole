import {
  runRuntimeTextFileImport,
  selectRuntimeImportTextFile,
  type RuntimeTextImportResult
} from '../../shared/platform/importExecutionRuntimeRepository';

import { requestEpubImportReleaseMode } from './epubImportReleaseModeDialogStore';

export async function runFormalImportFileFlow(): Promise<RuntimeTextImportResult | null> {
  const selectedFile = await selectRuntimeImportTextFile();
  if (!selectedFile) {
    return null;
  }
  if (selectedFile.kind !== 'epub') {
    return runRuntimeTextFileImport(undefined, undefined, { filePath: selectedFile.filePath });
  }
  const mode = await requestEpubImportReleaseMode(selectedFile);
  if (!mode) {
    return null;
  }
  return runRuntimeTextFileImport(undefined, undefined, {
    filePath: selectedFile.filePath,
    sequentialReadingMode: mode
  });
}
