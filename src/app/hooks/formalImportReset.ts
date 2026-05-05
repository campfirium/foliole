import { resetRuntimeImportData } from '../../shared/platform/importBridge';

interface ResetImportDataFlowOptions {
  getIsImporting: () => boolean;
  rehydrateWorkspace: () => void | Promise<void>;
  refreshOverview: () => Promise<void>;
  setFailureStatus: (message: string) => void;
  setImporting: (isImporting: boolean) => void;
  setResetStatus: (deletedRootNodeCount: number) => void;
}

export async function runResetImportDataFlow(options: ResetImportDataFlowOptions) {
  if (options.getIsImporting()) {
    return false;
  }

  options.setImporting(true);
  try {
    const result = await resetRuntimeImportData();
    if (!result) {
      options.setImporting(false);
      return false;
    }
    await options.rehydrateWorkspace();
    await options.refreshOverview();
    options.setResetStatus(result.deletedRootNodeCount);
    options.setImporting(false);
    return true;
  } catch (error) {
    options.setFailureStatus(error instanceof Error ? error.message : 'Import reset failed');
    return false;
  }
}
