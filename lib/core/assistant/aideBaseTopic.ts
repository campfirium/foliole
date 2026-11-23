import {
  locateAideFocusRange,
  readAideAnchorOriginalText,
  readAideAnchorRange,
  resolveAideContextSource,
  type AideContextNode
} from './aideAttachedContextSource.js';

export type AideBaseTopicLookup =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; payload: { error: 'not_derived'; kind: string } | { error: 'no_base_topic' } };

// A derived Topic or Item leads, through the anchors of its excerpt chain, back to the Base Topic it came from.
export function describeAideBaseTopic(focus: AideContextNode, ancestors: AideContextNode[]): AideBaseTopicLookup {
  if (focus.kind === 'folder') return { ok: false, payload: { error: 'not_derived', kind: focus.kind } };
  const chain = resolveAideContextSource(focus, ancestors);
  // A Base Topic is its own Base Topic; an Item that was not excerpted from anything has none.
  if (!chain || chain.source.kind !== 'topic') {
    return { ok: false, payload: { error: 'no_base_topic' } };
  }
  const nodes = [focus, ...ancestors];
  return { ok: true, payload: {
    base_topic: {
      content_char_count: chain.source.content.length,
      focus_position: locateAideFocusRange({ chain, focus }),
      folder_path: chain.folderPath,
      id: chain.source.id,
      title: chain.source.title
    },
    // The derived material first, then each excerpt between it and the Base Topic.
    derivation_path: nodes.slice(0, nodes.indexOf(chain.source)).map((node, index) => describeLevel(node, nodes[index + 1])),
    material_id: focus.id,
    material_kind: focus.kind
  } };
}

function describeLevel(node: AideContextNode, parent: AideContextNode | undefined) {
  const locator = node.anchor?.locator as Record<string, unknown> | undefined;
  return {
    id: node.id,
    kind: node.kind,
    ...(typeof locator?.page === 'number' ? { page: locator.page } : {}),
    parent_id: parent?.id ?? null,
    position_in_parent: readAideAnchorRange(node.anchor),
    quoted_text: readAideAnchorOriginalText(node.anchor),
    title: node.title
  };
}
