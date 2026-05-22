import {
  runRuntimeTextFileImport,
  selectRuntimeImportTextFile,
  type RuntimeImportedTextFile,
  type RuntimeTextImportResult
} from '../../shared/platform/importExecutionRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { requestEpubImportReleaseMode } from './epubImportReleaseModeDialogStore';

async function applyPostImportEpubReadingMode(file: RuntimeImportedTextFile, result: RuntimeTextImportResult) {
  if (!result.nodeId || result.resultStatus === 'failed') {
    return;
  }
  await useWorkspaceStore.persist.rehydrate();
  const mode = await requestEpubImportReleaseMode(file);
  if (!mode) {
    return;
  }
  useWorkspaceStore.getState().setNodeSequentialReading(result.nodeId, mode === 'sequential');
}

export async function runFormalImportFileFlow(): Promise<RuntimeTextImportResult | null> {
  const selectedFile = await selectRuntimeImportTextFile();
  if (!selectedFile) {
    return null;
  }
  if (selectedFile.kind !== 'epub') {
    return runRuntimeTextFileImport(undefined, undefined, { filePath: selectedFile.filePath });
  }
  const result = await runRuntimeTextFileImport(undefined, undefined, { filePath: selectedFile.filePath });
  if (result) {
    await applyPostImportEpubReadingMode(selectedFile, result);
  }
  return result;
}
