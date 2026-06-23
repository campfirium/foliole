import { demoPackToDemoTopics, type DemoSection, type DemoTopic } from './demoPack';
import { canonicalDemoPath, canonicalGuidePath } from './demoRoutes';
import { GENERATED_DEMO_PACKS } from './generated/demoPacks';

export type { DemoSection, DemoTopic };

export const DEMO_TOPICS_BY_LOCALE = Object.fromEntries(
  Object.entries(GENERATED_DEMO_PACKS).map(([locale, pack]) => [locale, demoPackToDemoTopics(pack)])
) as Record<string, DemoTopic[]>;
export const DEMO_TOPICS = getDemoTopicsForLocale('en');
export const DEFAULT_DEMO_TOPIC = DEMO_TOPICS[0]!;
export { canonicalDemoPath, canonicalGuidePath };

export function getDemoTopicsForLocale(locale: string) {
  return DEMO_TOPICS_BY_LOCALE[locale] ?? DEMO_TOPICS_BY_LOCALE.en ?? [];
}

export function getDemoTopicNodeId(topic: DemoTopic) {
  return `demo-${topic.id}`;
}
