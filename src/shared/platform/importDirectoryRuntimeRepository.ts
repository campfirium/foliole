import { selectRuntimeFolder } from './folderSelectionRuntimeRepository';

export async function selectRuntimeImportDirectory(): Promise<string | null> {
  return selectRuntimeFolder();
}
