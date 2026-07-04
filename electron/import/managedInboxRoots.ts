import { resolveDefaultImportRoot } from '../../lib/platform/libraryPaths.js';
import { loadLibraryPathSettings } from '../ipc/libraryPaths.js';
import { resolveManagedInboxPaths } from '../ipc/managedInboxFolder.js';
import { resolveAppPaths } from '../ipc/paths.js';

export interface ManagedInboxRootSpec {
  importRootPath?: string;
  rootPath: string;
}

function dedupeRootSpecs(specs: ManagedInboxRootSpec[]) {
  const seen = new Set<string>();
  return specs.filter((spec) => {
    const key = spec.rootPath.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function loadConfiguredManagedInboxRootPaths() {
  const libraryPaths = await loadLibraryPathSettings();
  const inboxRootPath = resolveManagedInboxPaths(resolveAppPaths().app_data_dir, libraryPaths.inbox).rootPath;
  const importRootPath = resolveDefaultImportRoot(libraryPaths.library_home);
  return dedupeRootSpecs([
    { rootPath: inboxRootPath },
    { importRootPath, rootPath: importRootPath }
  ]);
}

export function areSameManagedInboxRootSpecs(left: string[], right: ManagedInboxRootSpec[]) {
  return left.length === right.length && left.every((rootPath, index) => rootPath === right[index]?.rootPath);
}
