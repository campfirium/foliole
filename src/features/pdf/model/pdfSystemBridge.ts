import type { NodeAnchorLink } from '../../nodes/model/nodeTypes';

import type { PdfSystemExternalApi } from './pdfSystemApi';

interface PdfExternalSearchRequest {
  matchStart: number;
  page: number;
  query: string;
}

const activePdfSystems = new Map<string, Pick<PdfSystemExternalApi, 'requestAnchorJump'> & { requestSearch: (request: PdfExternalSearchRequest) => void }>();
const pendingAnchorJumps = new Map<string, NonNullable<NodeAnchorLink['locator']>>();
const pendingSearchRequests = new Map<string, PdfExternalSearchRequest>();

export function registerPdfSystem(
  nodeId: string,
  actions: Pick<PdfSystemExternalApi, 'requestAnchorJump'> & { requestSearch: (request: PdfExternalSearchRequest) => void }
) {
  activePdfSystems.set(nodeId, actions);
  const pendingLocator = pendingAnchorJumps.get(nodeId);
  if (pendingLocator) {
    pendingAnchorJumps.delete(nodeId);
    actions.requestAnchorJump(pendingLocator);
  }
  const pendingSearchRequest = pendingSearchRequests.get(nodeId);
  if (!pendingSearchRequest) {
    return;
  }
  pendingSearchRequests.delete(nodeId);
  actions.requestSearch(pendingSearchRequest);
}

export function unregisterPdfSystem(nodeId: string) {
  activePdfSystems.delete(nodeId);
}

export function requestPdfAnchorJump(nodeId: string, locator: NonNullable<NodeAnchorLink['locator']>) {
  const actions = activePdfSystems.get(nodeId);
  if (!actions) {
    pendingAnchorJumps.set(nodeId, locator);
    return false;
  }
  actions.requestAnchorJump(locator);
  return true;
}

export function requestPdfSearch(nodeId: string, request: PdfExternalSearchRequest) {
  const actions = activePdfSystems.get(nodeId);
  if (!actions) {
    pendingSearchRequests.set(nodeId, request);
    return false;
  }
  actions.requestSearch(request);
  return true;
}
