import { GENERATED_DEMO_PACK } from './generated/demoPack';
import { demoPackToDemoTopics, type DemoSection, type DemoTopic } from './demoPack';

export type { DemoSection, DemoTopic };

export const DEMO_TOPICS = demoPackToDemoTopics(GENERATED_DEMO_PACK);
export const DEFAULT_DEMO_TOPIC = DEMO_TOPICS[0];

export function canonicalDemoPath(slug: string) {
  return `/demo/${slug}/`;
}
