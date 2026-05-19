export const READWISE_ORIGINAL_FILE_WIDGET_ACTION_EVENT = 'foliole:readwise-original-file-action';

export type ReadwiseOriginalFileWidgetAction = 'download' | 'load';

export interface ReadwiseOriginalFileWidgetActionDetail {
  action: ReadwiseOriginalFileWidgetAction;
  nodeId: string;
}

export function dispatchReadwiseOriginalFileWidgetAction(detail: ReadwiseOriginalFileWidgetActionDetail) {
  window.dispatchEvent(new CustomEvent<ReadwiseOriginalFileWidgetActionDetail>(READWISE_ORIGINAL_FILE_WIDGET_ACTION_EVENT, { detail }));
}

export function isReadwiseOriginalFileWidgetActionDetail(value: unknown): value is ReadwiseOriginalFileWidgetActionDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const detail = value as Record<string, unknown>;
  return typeof detail.nodeId === 'string' && (detail.action === 'download' || detail.action === 'load');
}
