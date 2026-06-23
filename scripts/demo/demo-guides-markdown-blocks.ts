export interface DemoGuideMarkdownBlock {
  kind: 'heading' | 'paragraph';
  text: string;
}

export function coalesceParagraphBlocks(blocks: DemoGuideMarkdownBlock[]) {
  const coalesced: DemoGuideMarkdownBlock[] = [];
  for (const block of blocks) {
    const previous = coalesced[coalesced.length - 1];
    if (block.kind === 'paragraph' && previous?.kind === 'paragraph') {
      previous.text = `${previous.text}\n${block.text}`;
      continue;
    }
    coalesced.push({ ...block });
  }
  return coalesced;
}
