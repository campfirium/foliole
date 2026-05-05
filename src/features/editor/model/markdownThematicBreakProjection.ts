export interface MarkdownThematicBreakNode {
  firstChild: MarkdownThematicBreakNode | null;
  from: number;
  name: string;
  nextSibling: MarkdownThematicBreakNode | null;
  to: number;
}

export interface MarkdownThematicBreakRange {
  from: number;
  kind: 'thematicBreak';
  to: number;
}

export function collectMarkdownThematicBreakNodes(
  node: MarkdownThematicBreakNode,
  offset = 0,
  blocks: MarkdownThematicBreakRange[] = []
) {
  if (node.name === 'HorizontalRule') {
    blocks.push({ from: offset + node.from, kind: 'thematicBreak', to: offset + node.to });
    return blocks;
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    collectMarkdownThematicBreakNodes(child, offset, blocks);
  }
  return blocks;
}
