import type { NativeReadwiseImportRunResult } from '../../../lib/platform/nativeImportContract';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

export async function refreshWorkspaceAfterReadwiseImport(
  result: NativeReadwiseImportRunResult | null
) {
  if ((result?.imported_count ?? 0) > 0) {
    await refreshWorkspaceState('readwise-auto-import');
  }
}
