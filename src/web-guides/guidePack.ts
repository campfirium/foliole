export const GUIDE_PACK_CONTRACT_VERSION = 1;

export interface GuidePackBlock {
  id: string;
  kind: 'heading' | 'paragraph';
  text: string;
}

export interface GuidePackTextLocator {
  from: number;
  originalText: string;
  to: number;
}

export interface GuidePackHighlight {
  id: string;
  excerpt: string;
  locator: GuidePackTextLocator | { ranges: GuidePackTextLocator[] };
  title: string;
}

export interface GuidePackReviewItem {
  answer: string | null;
  id: string;
  kind: 'cloze' | 'item';
  prompt: string;
  title: string;
}

export interface GuidePackTopic {
  blocks: GuidePackBlock[];
  description: string;
  highlights: GuidePackHighlight[];
  id: string;
  reviewItems: GuidePackReviewItem[];
  runtime: {
    state: 'topic';
    topicId: string;
  };
  slug: string;
  summary: string;
  title: string;
}

export interface GuidePack {
  contractVersion: typeof GUIDE_PACK_CONTRACT_VERSION;
  generatedAt: string;
  source: {
    rootNodeId: string | null;
    rootTitle: string;
    warnings: string[];
  };
  topics: GuidePackTopic[];
}

export interface WebGuideSection {
  heading: string;
  body: string[];
}

export interface WebGuideSeed extends GuidePackTopic {
  sections: WebGuideSection[];
}

export function assertGuidePack(pack: GuidePack): GuidePack {
  if (pack.contractVersion !== GUIDE_PACK_CONTRACT_VERSION) {
    throw new Error(`Unsupported Guide Pack contract version: ${pack.contractVersion}`);
  }
  if (!pack.topics.length) {
    throw new Error('Guide Pack must include at least one topic.');
  }
  const slugs = new Set<string>();
  for (const topic of pack.topics) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.slug)) {
      throw new Error(`Invalid Guide Pack topic slug: ${topic.slug}`);
    }
    if (slugs.has(topic.slug)) {
      throw new Error(`Duplicate Guide Pack topic slug: ${topic.slug}`);
    }
    slugs.add(topic.slug);
    if (!topic.title.trim() || !topic.blocks.length) {
      throw new Error(`Guide Pack topic is incomplete: ${topic.id}`);
    }
  }
  return pack;
}

export function guidePackToWebGuides(pack: GuidePack): WebGuideSeed[] {
  return assertGuidePack(pack).topics.map((topic) => ({
    ...topic,
    sections: blocksToSections(topic)
  }));
}

function blocksToSections(topic: GuidePackTopic): WebGuideSection[] {
  const sections: WebGuideSection[] = [];
  let current: WebGuideSection | null = null;
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
