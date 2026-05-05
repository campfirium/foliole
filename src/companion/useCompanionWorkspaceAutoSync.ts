import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';

export function useForegroundAutoSync(
  setError: (error: string | null) => void,
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void,
  state: NativeCompanionWorkspaceSyncState,
  tryForegroundAutoSync: (args: {
    cancelled: () => boolean;
    setError(error: string | null): void;
    setReadableArticle(article: CompanionReadableArticle | null): void;
    setState(state: NativeCompanionWorkspaceSyncState): void;
    setStatus(status: CompanionWorkspaceSyncStatus): void;
    state: NativeCompanionWorkspaceSyncState;
  }) => Promise<void>
) {
  void setError;
  void setReadableArticle;
  void setState;
  void setStatus;
  void state;
  void tryForegroundAutoSync;
}
