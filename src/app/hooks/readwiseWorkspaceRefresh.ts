import type { NativeReadwiseImportRunResult } from '../../../lib/platform/nativeImportContract';
import { useWorkspaceStore } from '../../store/workspaceStore';

export async function refreshWorkspaceAfterReadwiseImport(
  result: NativeReadwiseImportRunResult | null
) {
  if ((result?.imported_count ?? 0) > 0) {
    await useWorkspaceStore.persist.rehydrate();
  }
}
