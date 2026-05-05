import { useCallback, useState } from 'react';

import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';

import { appendLinkPanel, closeLinkPanel, patchLinkPanel, type LinkPanelRecord } from './linkPanelState';

export function useExternalLinkPanels() {
  const [linkPanels, setLinkPanels] = useState<LinkPanelRecord[]>([]);

  const handleOpenExternalLink = useCallback((request: ExternalLinkOpenRequest) => {
    setLinkPanels((current) => appendLinkPanel(current, request));
  }, []);

  const handleCloseExternalLink = useCallback((panelId: string) => {
    setLinkPanels((current) => closeLinkPanel(current, panelId));
  }, []);

  const handleLinkPanelStateChange = useCallback(
    (panelId: string, state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>) => {
      setLinkPanels((current) => patchLinkPanel(current, panelId, state));
    },
    []
  );

  return {
    handleCloseExternalLink,
    handleLinkPanelStateChange,
    handleOpenExternalLink,
    linkPanels
  };
}
