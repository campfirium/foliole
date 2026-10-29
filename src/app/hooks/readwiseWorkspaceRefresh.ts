import type { NativeReadwiseImportRunResult } from '../../../lib/platform/nativeImportContract';
import { refreshWorkspaceState, refreshWorkspaceStateWithScope } from '../../store/workspaceRefreshScheduler';

export async function refreshWorkspaceAfterReadwiseImport(
  result: NativeReadwiseImportRunResult | null
) {
  if (result?.workspace_scope && result.library_scope) {
    await refreshWorkspaceStateWithScope(result.workspace_scope, result.library_scope, 'readwise-auto-import');
  } else if ((result?.imported_count ?? 0) > 0) {
    await refreshWorkspaceState('readwise-auto-import');
  }
}
