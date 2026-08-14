import { useEffect } from 'react';

import { useLocalization } from '../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../store/workspaceStore';

import { syncDemoUrlToNode } from './demoUrlSync';
import { syncDemoWorkspaceSnapshotLocale } from './demoWorkspaceReset';

export function DemoUrlSyncBridge() {
  const { languagePreference, locale } = useLocalization();
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);

  useEffect(() => {
    syncDemoUrlToNode(activeNodeId, languagePreference, locale);
    syncDemoWorkspaceSnapshotLocale();
  }, [activeNodeId, languagePreference, locale]);

  return null;
}
