import { useEffect } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { registerPdfSystem, unregisterPdfSystem } from '../../features/pdf/model/pdfSystemBridge';

export function useRegisterPdfSurface(
  nodeId: string | null,
  requestAnchorJump: (locator: NonNullable<NodeAnchorLink['locator']>) => void,
  requestSearch: (request: { matchStart: number; page: number; query: string }) => void
) {
  useEffect(() => {
    if (!nodeId) {
      return;
    }
    registerPdfSystem(nodeId, { requestAnchorJump, requestSearch });
    return () => {
      unregisterPdfSystem(nodeId);
    };
  }, [nodeId, requestAnchorJump, requestSearch]);
}
