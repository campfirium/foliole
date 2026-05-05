import type { NodeAnchorLink } from '../../nodes/model/nodeTypes';

import type { PdfSystemExternalApi } from './pdfSystemApi';

const activePdfSystems = new Map<string, Pick<PdfSystemExternalApi, 'requestAnchorJump'>>();

export function registerPdfSystem(nodeId: string, actions: Pick<PdfSystemExternalApi, 'requestAnchorJump'>) {
  activePdfSystems.set(nodeId, actions);
}

export function unregisterPdfSystem(nodeId: string) {
  activePdfSystems.delete(nodeId);
}

export function requestPdfAnchorJump(nodeId: string, locator: NonNullable<NodeAnchorLink['locator']>) {
  const actions = activePdfSystems.get(nodeId);
  if (!actions) {
    return false;
  }
  actions.requestAnchorJump(locator);
  return true;
}
