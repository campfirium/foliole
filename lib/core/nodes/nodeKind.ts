export const NODE_KINDS = ['folder', 'topic', 'item'] as const;
export const NODE_KIND_MIGRATION_CANDIDATES_META_KEY = 'node_kind_migration_candidates_v13';

export type NodeKind = (typeof NODE_KINDS)[number];

export interface NodeKindResolutionInput {
  anchorLinkKind: 'highlight' | 'cloze' | null;
  childCount: number;
  content: string;
  isInbox: boolean;
  reveal: string | null;
}

export interface NodeKindResolution {
  kind: NodeKind;
  reason:
    | 'special-inbox'
    | 'derived-highlight'
    | 'derived-cloze'
    | 'reveal-present'
    | 'content-present'
    | 'has-children'
    | 'empty-leaf-fallback-topic';
}

export function isNodeKind(value: unknown): value is NodeKind {
  return value === 'folder' || value === 'topic' || value === 'item';
}

export function resolveNodeKind(input: NodeKindResolutionInput): NodeKindResolution {
  if (input.isInbox) {
    return { kind: 'folder', reason: 'special-inbox' };
  }
  if (input.anchorLinkKind === 'highlight') {
    return { kind: 'topic', reason: 'derived-highlight' };
  }
  if (input.anchorLinkKind === 'cloze') {
    return { kind: 'item', reason: 'derived-cloze' };
  }
  if (input.reveal !== null) {
    return { kind: 'item', reason: 'reveal-present' };
  }
  if (input.content.trim().length > 0) {
    return { kind: 'topic', reason: 'content-present' };
  }
  if (input.childCount > 0) {
    return { kind: 'folder', reason: 'has-children' };
  }
  return { kind: 'topic', reason: 'empty-leaf-fallback-topic' };
}
