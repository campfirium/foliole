import { expect, it } from 'vitest';

import { APP_LOCALES } from '../../../../lib/core/localization/appLocaleRegistry';
import { GENERATED_GUIDED_SAMPLE_PACKS } from '../generated/guidedSamplePacks';

import { getGuidedSampleContent, getGuidedSampleRootTitles } from './guidedSampleContent';

it('provides one ordered eight-topic guide with shared images for every app locale', () => {
  expect(Object.keys(GENERATED_GUIDED_SAMPLE_PACKS)).toEqual(APP_LOCALES);
  for (const locale of APP_LOCALES) {
    const content = getGuidedSampleContent(locale);
    const topics = [content.root, ...content.children];
    expect(topics).toHaveLength(8);
    expect(content.children.every((topic) => topic.parentId === content.root.id)).toBe(true);
    expect(topics.filter((topic) => topic.attachmentIds.length > 0)).toHaveLength(5);
    for (const topic of topics) {
      for (const assetId of topic.attachmentIds) {
        expect(topic.content.match(new RegExp(`asset://${assetId}\\.png`, 'g'))).toHaveLength(1);
      }
    }
  }
});

it('keeps legacy English and simplified Chinese roots in duplicate detection', () => {
  const titles = getGuidedSampleRootTitles();
  expect(titles.has('Welcome to Foliole')).toBe(true);
  expect(titles.has('欢迎使用 Foliole')).toBe(true);
  expect(titles.has('歡迎使用 Foliole')).toBe(true);
  expect(titles.has('Willkommen bei Foliole')).toBe(true);
});
