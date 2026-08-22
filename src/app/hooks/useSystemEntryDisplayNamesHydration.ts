import { useEffect } from 'react';

import { useSystemEntryDisplayNamesSnapshot } from '../../shared/localization/systemEntryDisplayNamesStore';
import {
  hydrateDemoSystemEntryDisplayNames,
  hydrateRuntimeSystemEntryDisplayNames
} from '../../shared/platform/desktop/systemEntryDisplayNamesRuntimeRepository';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

export function useSystemEntryDisplayNamesHydration() {
  useSystemEntryDisplayNamesSnapshot();
  const { isDemo, startedAt } = useDemoRuntimeState();

  useEffect(() => {
    if (isDemo) {
      hydrateDemoSystemEntryDisplayNames();
      return;
    }
    void hydrateRuntimeSystemEntryDisplayNames().catch(() => undefined);
  }, [isDemo, startedAt]);
}
