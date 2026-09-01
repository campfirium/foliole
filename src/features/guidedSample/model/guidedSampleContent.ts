import type { AppLocale } from '../../../shared/localization/appLanguage';
import { GENERATED_GUIDED_SAMPLE_PACKS } from '../generated/guidedSamplePacks';

import type { GuidedSampleContentPack } from './guidedSamplePack';

export type { GuidedSampleTopicTemplate } from './guidedSamplePack';

export const GUIDED_SAMPLE_MARKER = '<!-- foliole-guided-sample:v1 -->';
const LEGACY_GUIDED_SAMPLE_ROOT_TITLES = ['Welcome to Foliole', '欢迎使用 Foliole'] as const;

export function getGuidedSampleContent(locale: AppLocale) {
  const pack = requireGuidedSamplePack(locale);
  const root = pack.topics.find((topic) => topic.id === pack.rootId);
  if (!root) throw new Error(`Guided sample pack is missing its root: ${locale}`);
  return {
    children: pack.topics.filter((topic) => topic.parentId === pack.rootId),
    root,
    rootTitle: pack.rootTitle
  };
}

export function getGuidedSampleRootTitles() {
  return new Set([
    ...LEGACY_GUIDED_SAMPLE_ROOT_TITLES,
    ...Object.values(GENERATED_GUIDED_SAMPLE_PACKS).map((pack) => pack.rootTitle)
  ]);
}

function requireGuidedSamplePack(locale: AppLocale): GuidedSampleContentPack {
  const pack = GENERATED_GUIDED_SAMPLE_PACKS[locale];
  if (!pack) throw new Error(`Missing guided sample pack: ${locale}`);
  return pack;
}
