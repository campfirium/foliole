import type { MouseEvent as ReactMouseEvent } from 'react';

import type { WorkspaceEditorContextMenu } from './components/WorkspaceLayout';

export interface ImageContextMenuState extends WorkspaceEditorContextMenu {
  imageAttachmentId: string;
  imageRange: {
    from: number;
    to: number;
  };
  kind: 'image';
}

function parseImageRangeValue(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function resolveImageContextMenuState(
  event: ReactMouseEvent<HTMLDivElement>,
  position: { left: number; top: number }
): ImageContextMenuState | null {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const imageWidget = target.closest('[data-md-image-source]');
  if (!(imageWidget instanceof HTMLElement)) {
    return null;
  }
  const attachmentId = imageWidget.dataset.mdImageAttachmentId?.trim() ?? '';
  const from = parseImageRangeValue(imageWidget.dataset.mdImageFrom);
  const to = parseImageRangeValue(imageWidget.dataset.mdImageTo);
  if (!attachmentId || from === null || to === null || to < from) {
    return null;
  }
  return {
    imageAttachmentId: attachmentId,
    imageRange: { from, to },
    kind: 'image',
    left: position.left,
    top: position.top
  };
}
