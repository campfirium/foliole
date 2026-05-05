import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createPdfHighlightHandler(args: BuildControllerLayoutPropsArgs) {
  return (selectionText: string, locator: NodeAnchorLink['locator']) => {
    if (args.runtime.isViewingTrashNode || !args.ws.activeNodeId) {
      return false;
    }
    const anchorId = `pdf-${crypto.randomUUID()}`;
    const anchorLink = locator
      ? {
          id: anchorId,
          kind: 'highlight' as const,
          locator
        }
      : undefined;
    return Boolean(args.ws.createHighlightNodeFromSelection(args.ws.activeNodeId, selectionText, anchorId, anchorLink));
  };
}
