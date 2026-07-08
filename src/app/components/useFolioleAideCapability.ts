import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadAssistantStatus } from '../../shared/platform/assistantRuntime';
import {
  getFolioleAideEnabled,
  setFolioleAideEnabled,
  subscribeFolioleAideEnabled
} from '../../shared/platform/folioleAideSettings';

export type FolioleAideCapabilityState = 'checking' | 'notEnabled' | 'ready' | 'unavailable' | 'needsCheck';

export function useFolioleAideCapability() {
  const [enabled, setEnabled] = useState(() => getFolioleAideEnabled());
  const [state, setState] = useState<FolioleAideCapabilityState>(() =>
    enabled ? 'needsCheck' : 'notEnabled'
  );

  useEffect(
    () =>
      subscribeFolioleAideEnabled((nextEnabled) => {
        setEnabled(nextEnabled);
        setState(nextEnabled ? 'needsCheck' : 'notEnabled');
      }),
    []
  );

  const check = useCallback(async () => {
    setState('checking');
    const status = await loadAssistantStatus();
    setState(status?.state === 'ready' ? 'ready' : 'unavailable');
  }, []);

  const enable = useCallback(async () => {
    setFolioleAideEnabled(true);
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
