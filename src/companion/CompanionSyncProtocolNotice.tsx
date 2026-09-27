import { createContext, useContext, type ReactNode } from 'react';

import { SyncProtocolIncompatibleDialog } from '../shared/ui/SyncProtocolIncompatibleDialog';
import { isSyncProtocolIncompatibleError, useSyncProtocolIncompatibleNotice } from '../shared/ui/useSyncProtocolIncompatibleNotice';

const RetryContext = createContext<() => void>(() => undefined);

export function useCompanionSyncProtocolNoticeRetry() {
  return useContext(RetryContext);
}

export function CompanionSyncProtocolNotice(props: { children: ReactNode; error: string | null }) {
  const notice = useSyncProtocolIncompatibleNotice(isSyncProtocolIncompatibleError(props.error));
  return (
    <RetryContext.Provider value={notice.retry}>
      {props.children}
      <SyncProtocolIncompatibleDialog open={notice.open} onClose={notice.close} />
    </RetryContext.Provider>
  );
}
