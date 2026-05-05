import type { NativeWorkspaceBacklink } from '../../../lib/platform/nativeContract';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';

function isNativeWorkspaceBacklink(value: unknown): value is NativeWorkspaceBacklink {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.source_node_id === 'string' &&
    typeof candidate.source_title === 'string' &&
    typeof candidate.context === 'string' &&
    typeof candidate.match_count === 'number';
}

export function toRuntimeNodeBacklinks(payload: unknown): BacklinkItem[] | null {
  if (!Array.isArray(payload)) {
    return null;
  }
  const backlinks = payload.filter(isNativeWorkspaceBacklink);
  if (backlinks.length !== payload.length) {
    return null;
  }
  return backlinks.map((backlink) => ({
    sourceNodeId: backlink.source_node_id,
    sourceTitle: backlink.source_title,
    context: backlink.context,
    matchCount: backlink.match_count
  }));
}
