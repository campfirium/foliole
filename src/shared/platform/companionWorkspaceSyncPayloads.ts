import type { NativeCompanionDirtyNodePayload } from '../../../lib/platform/nativeCompanionSyncContract';

import type { CompanionReadableArticle } from './companionReadableArticle';

export function normalizeReadableArticlePayload(value: unknown): CompanionReadableArticle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const article = (value as Record<string, unknown>).readable_article;
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    return null;
  }
  const raw = article as Record<string, unknown>;
  if (typeof raw.content !== 'string' || typeof raw.node_id !== 'string' || typeof raw.title !== 'string') {
    return null;
  }
  return {
    content: raw.content,
    hideTitleHeading: raw.hide_title_heading === true,
    nodeId: raw.node_id,
    textAnchorDecorations: [],
    title: raw.title
  };
}

function isDirtyNodePayload(node: unknown): node is NativeCompanionDirtyNodePayload['nodes'][number] {
  return Boolean(
    node &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    typeof (node as { device_id?: unknown }).device_id === 'string' &&
    typeof (node as { object_id?: unknown }).object_id === 'string' &&
    (node as { object_type?: unknown }).object_type === 'node' &&
    typeof (node as { updated_at?: unknown }).updated_at === 'string' &&
    (node as { snapshot?: unknown }).snapshot &&
    typeof (node as { snapshot: unknown }).snapshot === 'object' &&
    !Array.isArray((node as { snapshot: unknown }).snapshot)
  );
}

export function normalizeDirtyNodePayload(value: unknown): NativeCompanionDirtyNodePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      device_id: 'web-preview',
      last_synced_at: null,
      nodes: []
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    device_id: typeof raw.device_id === 'string' && raw.device_id.trim() ? raw.device_id.trim() : 'web-preview',
    last_synced_at: typeof raw.last_synced_at === 'string' && raw.last_synced_at.trim() ? raw.last_synced_at.trim() : null,
    nodes: Array.isArray(raw.nodes) ? raw.nodes.filter(isDirtyNodePayload) : []
  };
}
