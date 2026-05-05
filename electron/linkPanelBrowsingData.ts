import { session } from 'electron';

export const LINK_PANEL_WEBVIEW_PARTITION = 'persist:foliole-link-panels';

export interface ClearLinkPanelBrowsingDataResult {
  cleared_at: string;
  status: 'cleared';
}

export async function clearLinkPanelBrowsingData(now = new Date()): Promise<ClearLinkPanelBrowsingDataResult> {
  await session.fromPartition(LINK_PANEL_WEBVIEW_PARTITION).clearStorageData();
  return {
    cleared_at: now.toISOString(),
    status: 'cleared'
  };
}
