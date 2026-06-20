import { useEffect } from 'react';

import { useLocalization } from '../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../store/workspaceStore';

import { demoPathSegmentFromLocale, syncDemoUrlToNode } from './demoUrlSync';

export function DemoUrlSyncBridge() {
  const { locale } = useLocalization();
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);

  useEffect(() => {
    syncDemoUrlToNode(activeNodeId, demoPathSegmentFromLocale(locale));
  }, [activeNodeId, locale]);

  return null;
}
