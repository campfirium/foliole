import { useEffect, useState } from 'react';

import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { translate } from '../../shared/localization/translations';
import { loadRuntimeNodeTextAlternativePreview } from '../../shared/platform/desktop/nodeTextAlternativeRuntimeRepository';
import { loadRuntimeNodeSourceUpdatePreview, type RuntimeNodeSourceUpdatePreview } from '../../shared/platform/nodeSourceRuntimeRepository';
import { onManagedInboxUpdated, onWorkspaceContentChanged } from '../../shared/platform/runtimeShellEvents';
import { clearAppRuntimeNotice, showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

interface NodeSourceUpdatePreviewState {
  isLoading: boolean;
  value: RuntimeNodeSourceUpdatePreview | null;
}

const DEFAULT_STATE: NodeSourceUpdatePreviewState = {
  isLoading: false,
  value: null
};

export function useNodeSourceUpdatePreview(nodeId: string | null) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [state, setState] = useState<NodeSourceUpdatePreviewState>(DEFAULT_STATE);

  useEffect(() => {
    if (!nodeId) {
      setState(DEFAULT_STATE);
      return;
    }

    let isDisposed = false;
    let latestRequest = 0;
    let noticeId: number | null = null;
    const unlisteners: (() => void)[] = [];

    const loadPreview = async () => {
      if (isDisposed) return;
      const request = ++latestRequest;
      setState((current) => ({ isLoading: true, value: current.value }));
      try {
        const value = await loadRuntimeNodeTextAlternativePreview(nodeId, selectedId)
          ?? await loadRuntimeNodeSourceUpdatePreview(nodeId);
        if (isDisposed || request !== latestRequest) return;
        if (noticeId !== null) clearAppRuntimeNotice(noticeId);
        noticeId = null;
        setState({ isLoading: false, value });
      } catch {
        if (isDisposed || request !== latestRequest) return;
        setState(DEFAULT_STATE);
        noticeId = showAppRuntimeNotice(translate(getStoredAppLocale(), 'desktop.sourceUpdate.previewLoadFailed'));
      }
    };

    void loadPreview();

    for (const subscribe of [onManagedInboxUpdated, onWorkspaceContentChanged]) {
      void subscribe(() => { void loadPreview(); }).then(dispose => {
        if (isDisposed) dispose?.();
        else if (dispose) unlisteners.push(dispose);
      });
    }

    return () => {
      isDisposed = true;
      if (noticeId !== null) clearAppRuntimeNotice(noticeId);
      unlisteners.forEach(dispose => dispose());
    };
  }, [nodeId, selectedId]);

  return { ...state, selectAlternative: setSelectedId };
}
