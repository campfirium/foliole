export interface DemoGuideMarkdownBlock {
  kind: 'heading' | 'paragraph';
  text: string;
}

export function coalesceParagraphBlocks(blocks: DemoGuideMarkdownBlock[]) {
  return blocks.map((block) => ({ ...block }));
}
