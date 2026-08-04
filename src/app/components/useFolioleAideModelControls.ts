import { useCallback, useEffect, useState } from 'react';

import type {
  NativeAssistantModelCatalog,
  NativeAssistantModelSelection
} from '../../../lib/platform/nativeAssistantModelContract';
import { loadAssistantModelCatalog } from '../../shared/platform/assistantRuntime';
import {
  getFolioleAideModelSelection,
  resolveFolioleAideModelSelection,
  setFolioleAideModelSelection
} from '../../shared/platform/folioleAideSettings';

export type FolioleAideModelControlsState = {
  catalog: NativeAssistantModelCatalog | null;
  refresh: () => Promise<void>;
  select: (selection: NativeAssistantModelSelection) => void;
  selection: NativeAssistantModelSelection | null;
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
};

export function useFolioleAideModelControls(aideReady: boolean): FolioleAideModelControlsState {
  const [catalog, setCatalog] = useState<NativeAssistantModelCatalog | null>(null);
  const [selection, setSelection] = useState<NativeAssistantModelSelection | null>(null);
  const [status, setStatus] = useState<FolioleAideModelControlsState['status']>('idle');

  const refresh = useCallback(async () => {
    setStatus((current) => current === 'ready' ? current : 'loading');
    try {
      const nextCatalog = await loadAssistantModelCatalog();
      if (!nextCatalog) throw new Error('model_catalog_unavailable');
      const nextSelection = resolveFolioleAideModelSelection(
        nextCatalog,
        getFolioleAideModelSelection()
      );
      if (!nextSelection) throw new Error('model_catalog_missing_default');
      setFolioleAideModelSelection(nextSelection);
      setCatalog(nextCatalog);
      setSelection(nextSelection);
      setStatus('ready');
    } catch {
      setCatalog(null);
      setSelection(null);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    if (aideReady) void refresh();
    else setStatus('idle');
  }, [aideReady, refresh]);

  return {
    catalog,
    refresh,
    select: (nextSelection) => {
      if (!catalog) return;
      const resolved = resolveFolioleAideModelSelection(catalog, nextSelection);
      if (!resolved) return;
      setFolioleAideModelSelection(resolved);
      setSelection(resolved);
    },
    selection,
    status
  };
}
