export const DEMO_PACK_CONTRACT_VERSION = 3;
export const DEMO_SOURCE_LOCALE_DEFAULT = 'en';
export const DEMO_TRANSLATABLE_FIELDS = [
  'topics[].title',
  'topics[].description',
  'topics[].summary',
  'topics[].blocks[].text',
  'topics[].highlights[].title',
  'topics[].highlights[].excerpt',
  'topics[].reviewItems[].title',
  'topics[].reviewItems[].prompt',
  'topics[].reviewItems[].answer'
] as const;

export interface DemoPackRelativeTime {
  dayOffset: number;
}

export interface DemoPackReadingSeed {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: DemoPackRelativeTime;
  nextAt: DemoPackRelativeTime;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed' | 'locked';
}

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

export interface DemoPackReviewScheduleSeed {
  difficulty: number;
  due: DemoPackRelativeTime;
  elapsedDays: number;
  lapses: number;
  lastReviewAt: DemoPackRelativeTime | null;
  reps: number;
  reviewItemId: string;
  scheduledDays: number;
  stability: number;
  state: 0 | 1 | 2 | 3;
}

export interface DemoPackTopic {
  blocks: DemoPackBlock[];
  childTopicIds: string[];
  description: string;
  highlights: DemoPackHighlight[];
  id: string;
  parentId: string | null;
  readingSeed: DemoPackReadingSeed;
  reviewItems: DemoPackReviewItem[];
  reviewScheduleSeeds: DemoPackReviewScheduleSeed[];
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
  sourceLocale: string;
  translatableFields: readonly (typeof DEMO_TRANSLATABLE_FIELDS)[number][];
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
  if (!pack.sourceLocale?.trim()) {
    throw new Error('Demo Pack must include sourceLocale.');
  }
  if (!Array.isArray(pack.translatableFields) || !pack.translatableFields.length) {
    throw new Error('Demo Pack must include translatable fields.');
  }
  for (const field of pack.translatableFields) {
    if (!(DEMO_TRANSLATABLE_FIELDS as readonly string[]).includes(field)) {
      throw new Error(`Unsupported Demo Pack translatable field: ${field}`);
    }
  }
  const slugs = new Set<string>();
  const ids = new Set(pack.topics.map((topic) => topic.id));
  for (const topic of pack.topics) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(topic.slug)) {
      throw new Error(`Invalid Demo Pack topic slug: ${topic.slug}`);
    }
    if (slugs.has(topic.slug)) {
      throw new Error(`Duplicate Demo Pack topic slug: ${topic.slug}`);
    }
    slugs.add(topic.slug);
    if (!topic.title.trim() || !topic.blocks.length) {
      throw new Error(`Demo Pack topic is incomplete: ${topic.id}`);
    }
    if (topic.parentId !== null && !ids.has(topic.parentId)) {
      throw new Error(`Demo Pack topic references missing parent: ${topic.id}`);
    }
    for (const childTopicId of topic.childTopicIds) {
      if (!ids.has(childTopicId)) throw new Error(`Demo Pack topic references missing child: ${childTopicId}`);
    }
    assertReadingSeed(topic);
    assertReviewScheduleSeeds(topic);
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

function assertReadingSeed(topic: DemoPackTopic) {
  const seed = topic.readingSeed;
  if (!seed || !isRelativeTime(seed.lastHandledAt) || !isRelativeTime(seed.nextAt)) {
    throw new Error(`Demo Pack topic is missing reading seed: ${topic.id}`);
  }
  if (seed.intervalDurationMs < 0 || seed.intervalGrowthFactor <= 0 || seed.priority < 0 || seed.readingPosition < 0 || seed.repetitionCount < 0) {
    throw new Error(`Demo Pack topic has invalid reading seed: ${topic.id}`);
  }
}

function assertReviewScheduleSeeds(topic: DemoPackTopic) {
  const reviewItemIds = new Set(topic.reviewItems.map((item) => item.id));
  const scheduleItemIds = new Set<string>();
  for (const seed of topic.reviewScheduleSeeds) {
    if (!reviewItemIds.has(seed.reviewItemId)) {
      throw new Error(`Demo Pack review schedule seed references missing item: ${seed.reviewItemId}`);
    }
    if (scheduleItemIds.has(seed.reviewItemId)) {
      throw new Error(`Duplicate Demo Pack review schedule seed: ${seed.reviewItemId}`);
    }
    scheduleItemIds.add(seed.reviewItemId);
    if (!isRelativeTime(seed.due) || (seed.lastReviewAt !== null && !isRelativeTime(seed.lastReviewAt))) {
      throw new Error(`Demo Pack review schedule seed has invalid relative time: ${seed.reviewItemId}`);
    }
  }
  if (scheduleItemIds.size !== reviewItemIds.size) {
    throw new Error(`Demo Pack topic review schedule seed count does not match review items: ${topic.id}`);
  }
}

function isRelativeTime(value: DemoPackRelativeTime | null | undefined): value is DemoPackRelativeTime {
  return Boolean(value && Number.isInteger(value.dayOffset) && value.dayOffset >= 0);
}
