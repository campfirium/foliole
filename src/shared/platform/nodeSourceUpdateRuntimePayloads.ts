export interface RuntimeNodeSourceUpdatePreview {
  checkedAt: string;
  currentHighlightCount: number;
  currentContent: string;
  incomingUpdateId: string | null;
  alternativeId?: string | null;
  kind: 'incoming_update' | 'source_update' | 'sync_alternative';
  sourceNodeId: string;
  updatedHighlightCount: number;
  updatedContent: string;
}

function isNodeSourceUpdateKind(value: unknown): value is RuntimeNodeSourceUpdatePreview['kind'] {
  return value === 'incoming_update' || value === 'source_update' || value === 'sync_alternative';
}

export function toRuntimeNodeSourceUpdatePreview(value: unknown): RuntimeNodeSourceUpdatePreview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.checked_at !== 'string' ||
    typeof payload.current_highlight_count !== 'number' ||
    typeof payload.current_content !== 'string' ||
    typeof payload.source_node_id !== 'string' ||
    typeof payload.updated_highlight_count !== 'number' ||
    typeof payload.updated_content !== 'string' ||
    (payload.incoming_update_id !== undefined && typeof payload.incoming_update_id !== 'string') ||
    (payload.kind !== undefined && !isNodeSourceUpdateKind(payload.kind))
  ) {
    return null;
  }
  return {
    checkedAt: payload.checked_at,
    currentHighlightCount: payload.current_highlight_count,
    currentContent: payload.current_content,
    incomingUpdateId: typeof payload.incoming_update_id === 'string' ? payload.incoming_update_id : null,
    alternativeId: typeof payload.alternative_id === 'string' ? payload.alternative_id : null,
    kind: isNodeSourceUpdateKind(payload.kind) ? payload.kind : 'source_update',
    sourceNodeId: payload.source_node_id,
    updatedHighlightCount: payload.updated_highlight_count,
    updatedContent: payload.updated_content
  };
}
