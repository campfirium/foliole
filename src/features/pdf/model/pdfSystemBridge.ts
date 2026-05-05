import type { NodeAnchorLink } from '../../nodes/model/nodeTypes';

import type { PdfSystemExternalApi } from './pdfSystemApi';

const activePdfSystems = new Map<string, Pick<PdfSystemExternalApi, 'requestAnchorJump'>>();
const pendingAnchorJumps = new Map<string, NonNullable<NodeAnchorLink['locator']>>();

export function registerPdfSystem(nodeId: string, actions: Pick<PdfSystemExternalApi, 'requestAnchorJump'>) {
  activePdfSystems.set(nodeId, actions);
  const pendingLocator = pendingAnchorJumps.get(nodeId);
  if (!pendingLocator) {
    return;
  }
  pendingAnchorJumps.delete(nodeId);
  actions.requestAnchorJump(pendingLocator);
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
