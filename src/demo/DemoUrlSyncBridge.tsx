import { useEffect } from 'react';

import { useLocalization } from '../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../store/workspaceStore';

import { syncDemoUrlToNode } from './demoUrlSync';

export function DemoUrlSyncBridge() {
  const { languagePreference, locale } = useLocalization();
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);

  useEffect(() => {
    syncDemoUrlToNode(activeNodeId, languagePreference, locale);
  }, [activeNodeId, languagePreference, locale]);

  return null;
}
