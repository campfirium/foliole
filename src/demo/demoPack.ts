export const DEMO_PACK_CONTRACT_VERSION = 1;

export interface DemoPackBlock {
  id: string;
  kind: 'heading' | 'paragraph';
  text: string;
}

export interface DemoPackTextLocator {
  from: number;
  originalText: string;
  to: number;
}

export interface DemoPackHighlight {
  id: string;
  excerpt: string;
  locator: DemoPackTextLocator | { ranges: DemoPackTextLocator[] };
  title: string;
}

export interface DemoPackReviewItem {
  answer: string | null;
  id: string;
  kind: 'cloze' | 'item';
  prompt: string;
  title: string;
}

export interface DemoPackTopic {
  blocks: DemoPackBlock[];
  description: string;
  highlights: DemoPackHighlight[];
  id: string;
  reviewItems: DemoPackReviewItem[];
  runtime: {
    state: 'topic';
    topicId: string;
  };
  slug: string;
  summary: string;
  title: string;
}

export interface DemoPack {
  contractVersion: typeof DEMO_PACK_CONTRACT_VERSION;
  generatedAt: string;
  source: {
    rootNodeId: string | null;
    rootTitle: string;
    warnings: string[];
  };
  topics: DemoPackTopic[];
}

export interface DemoSection {
  heading: string;
  body: string[];
}

export interface DemoTopic extends DemoPackTopic {
  sections: DemoSection[];
}

export function assertDemoPack(pack: DemoPack): DemoPack {
  if (pack.contractVersion !== DEMO_PACK_CONTRACT_VERSION) {
    throw new Error(`Unsupported Demo Pack contract version: ${pack.contractVersion}`);
  }
  if (!pack.topics.length) {
    throw new Error('Demo Pack must include at least one topic.');
  }
  const slugs = new Set<string>();
  for (const topic of pack.topics) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.slug)) {
      throw new Error(`Invalid Demo Pack topic slug: ${topic.slug}`);
    }
    if (slugs.has(topic.slug)) {
      throw new Error(`Duplicate Demo Pack topic slug: ${topic.slug}`);
    }
    slugs.add(topic.slug);
    if (!topic.title.trim() || !topic.blocks.length) {
      throw new Error(`Demo Pack topic is incomplete: ${topic.id}`);
    }
  }
  return pack;
}

export function demoPackToDemoTopics(pack: DemoPack): DemoTopic[] {
  return assertDemoPack(pack).topics.map((topic) => ({
    ...topic,
    sections: blocksToSections(topic)
  }));
}

function blocksToSections(topic: DemoPackTopic): DemoSection[] {
  const sections: DemoSection[] = [];
  let current: DemoSection | null = null;
  for (const block of topic.blocks) {
    if (block.kind === 'heading') {
      current = { heading: block.text, body: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: topic.title, body: [] };
      sections.push(current);
    }
    current.body.push(block.text);
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.body.length ? section.body : [topic.summary]
  }));
}
