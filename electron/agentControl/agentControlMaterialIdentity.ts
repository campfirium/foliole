export type AgentMaterialAnchorKind = 'cloze' | 'highlight';
export type AgentMaterialSpecialKind = 'home' | 'inbox' | 'trash' | 'virtual' | 'virtual-root';

const HOME_NODE_ID = 'special-home';
const INBOX_NODE_ID = 'special-inbox';
const TRASH_NODE_ID = 'special-trash';
const VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';

export interface AgentMaterialIdentityInput {
  anchor_link: string | null;
  id: string;
  parent_id: string | null;
}

export interface AgentMaterialIdentityProjection {
  anchor_kind?: AgentMaterialAnchorKind;
  special_kind?: AgentMaterialSpecialKind;
}

export function projectAgentMaterialIdentity(input: AgentMaterialIdentityInput): AgentMaterialIdentityProjection {
  return {
    ...projectAnchorKind(input.anchor_link),
    ...projectSpecialKind(input)
  };
}

function projectAnchorKind(rawAnchorLink: string | null): Pick<AgentMaterialIdentityProjection, 'anchor_kind'> | object {
  if (!rawAnchorLink) return {};
  try {
    const anchor = JSON.parse(rawAnchorLink) as { kind?: unknown };
    return anchor.kind === 'highlight' || anchor.kind === 'cloze'
      ? { anchor_kind: anchor.kind }
      : {};
  } catch {
    return {};
  }
}

function projectSpecialKind(input: Pick<AgentMaterialIdentityInput, 'id' | 'parent_id'>): Pick<AgentMaterialIdentityProjection, 'special_kind'> | object {
  if (input.id === HOME_NODE_ID) return { special_kind: 'home' };
  if (input.id === INBOX_NODE_ID) return { special_kind: 'inbox' };
  if (input.id === TRASH_NODE_ID) return { special_kind: 'trash' };
  if (input.id === VIRTUAL_ROOT_NODE_ID) return { special_kind: 'virtual-root' };
  if (input.parent_id === VIRTUAL_ROOT_NODE_ID) return { special_kind: 'virtual' };
  return {};
}
