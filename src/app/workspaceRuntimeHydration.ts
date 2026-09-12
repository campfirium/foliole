import { loadRuntimeLibraryPathSettings } from '../shared/platform/libraryPathsRuntimeRepository';
import { ensureWorkspaceHydrated } from '../store/workspaceStoreHydration';

export async function ensureWorkspaceRuntimeHydrated() {
  await loadRuntimeLibraryPathSettings();
  await ensureWorkspaceHydrated();
}
