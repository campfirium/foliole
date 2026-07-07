import { useCallback, useMemo, useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { loadAssistantStatus } from '../../shared/platform/assistantRuntime';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../shared/platform/storage';

export type FolioleAideCapabilityState = 'checking' | 'notEnabled' | 'ready' | 'unavailable' | 'needsCheck';

export function useFolioleAideCapability() {
  const [enabled, setEnabled] = useState(() => loadFolioleAideEnabled());
  const [state, setState] = useState<FolioleAideCapabilityState>(() =>
    enabled ? 'needsCheck' : 'notEnabled'
  );

  const check = useCallback(async () => {
    setState('checking');
    const status = await loadAssistantStatus();
    setState(status?.state === 'ready' ? 'ready' : 'unavailable');
  }, []);

  const enable = useCallback(async () => {
    saveFolioleAideEnabled();
    setEnabled(true);
    await check();
  }, [check]);

  return useMemo(
    () => ({
      enabled,
      enable,
      ready: state === 'ready',
      retry: check,
      state
    }),
    [check, enable, enabled, state]
  );
}

function loadFolioleAideEnabled() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled) === 'true';
}

function saveFolioleAideEnabled() {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');
}
