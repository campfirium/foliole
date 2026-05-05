import { getSelectionCommandPayloadForContentRanges } from '../contextCommands';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export function createPastedTextAnchorsHandler(args: BuildControllerLayoutPropsArgs) {
  return ({
    anchors,
    content,
    nodeId
  }: {
    anchors: Array<{ from: number; kind: 'highlight' | 'cloze'; to: number }>;
    content: string;
    nodeId: string;
  }) => {
    if (args.runtime.isViewingTrashNode || anchors.length === 0) {
      return;
    }

    anchors
      .slice()
      .sort((left, right) => left.from - right.from)
      .forEach((anchor) => {
        const payload = getSelectionCommandPayloadForContentRanges(nodeId, content, [{ from: anchor.from, to: anchor.to }]);
        if (!payload) {
          return;
        }
        if (anchor.kind === 'cloze') {
          args.editorCtx.handleCreateClozeFromPayload(payload);
          return;
        }
        args.editorCtx.handleCreateHighlightFromPayload(payload);
      });
  };
}
