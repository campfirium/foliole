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

export function collectMarkdownHyphenThematicBreakLines(text: string, offset = 0): MarkdownThematicBreakRange[] {
  const ranges: MarkdownThematicBreakRange[] = [];
  let inFence = false;
  let cursor = 0;
  for (const line of text.split('\n')) {
    const lineStart = cursor;
    const lineEnd = lineStart + line.length;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    } else if (!inFence && /^\s*-{3,}\s*$/.test(line)) {
      ranges.push({
        from: offset + lineStart + (line.match(/^\s*/)?.[0].length ?? 0),
        kind: 'thematicBreak',
        to: offset + lineEnd - (line.match(/\s*$/)?.[0].length ?? 0)
      });
    }
    cursor = lineEnd + 1;
  }
  return ranges;
}
