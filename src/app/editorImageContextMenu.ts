import type { MouseEvent as ReactMouseEvent } from 'react';

import { parseAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl';

import type { WorkspaceEditorContextMenu } from './components/WorkspaceLayout';
import type { SelectionCommandPayload } from './contextCommands';

export interface ImageContextMenuState extends WorkspaceEditorContextMenu {
  imageAttachmentId: string;
  imageStorageKey: string;
  imageRange: {
    from: number;
    to: number;
  };
  kind: 'image';
  payload: SelectionCommandPayload | null;
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
  const storageKey = parseAssetMarkdownUrl(imageWidget.dataset.mdImageSource ?? '');
  const from = parseImageRangeValue(imageWidget.dataset.mdImageFrom);
  const to = parseImageRangeValue(imageWidget.dataset.mdImageTo);
  if (!storageKey || !attachmentId || from === null || to === null || to < from) {
    return null;
  }
  return {
    imageAttachmentId: attachmentId,
    imageStorageKey: storageKey,
    imageRange: { from, to },
    kind: 'image',
    left: position.left,
    payload: null,
    top: position.top
  };
}
