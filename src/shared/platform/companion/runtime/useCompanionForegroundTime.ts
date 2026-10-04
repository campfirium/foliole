import { useEffect } from 'react';

import { isNativeCompanionRuntime } from '../../companionBootstrap';

import { startCompanionForegroundTime } from './companionForegroundTime';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

export function useCompanionForegroundTime(ready: boolean) {
  useEffect(() => {
    if (ready && isNativeCompanionRuntime()) {
      void startCompanionForegroundTime(getIosCompanionDatabaseOwner()).catch(() => undefined);
    }
  }, [ready]);
}
