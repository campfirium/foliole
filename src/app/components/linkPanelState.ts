import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';

export interface LinkPanelRecord {
  anchorPoint?: ExternalLinkOpenRequest['anchorPoint'];
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
  id: string;
  title: string;
}

function createPanelId() {
  return `link-panel-${crypto.randomUUID()}`;
}

function resolvePanelTitle(url: string) {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function createLinkPanel(request: ExternalLinkOpenRequest): LinkPanelRecord {
  return {
    anchorPoint: request.anchorPoint,
    canGoBack: false,
    canGoForward: false,
    currentUrl: request.href,
    id: createPanelId(),
    title: resolvePanelTitle(request.href)
  };
}

export function appendLinkPanel(panels: LinkPanelRecord[], request: ExternalLinkOpenRequest) {
  return [...panels, createLinkPanel(request)];
}

export function closeLinkPanel(panels: LinkPanelRecord[], panelId: string) {
  return panels.filter((panel) => panel.id !== panelId);
}

export function patchLinkPanel(
  panels: LinkPanelRecord[],
  panelId: string,
  patch: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>
) {
  return panels.map((panel) => (panel.id === panelId ? { ...panel, ...patch } : panel));
}

export function replaceLinkPanelUrl(panels: LinkPanelRecord[], panelId: string, url: string) {
  return patchLinkPanel(panels, panelId, {
    canGoBack: false,
    canGoForward: false,
    currentUrl: url,
    title: resolvePanelTitle(url)
  });
}
