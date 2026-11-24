import { expect, it } from 'vitest';

import { APP_LOCALES } from '../localization/appLocaleRegistry.js';

import { GENERATED_GUIDED_SAMPLE_PACKS } from './generated/guidedSamplePacks.js';
import { MOBILE_GENERATED_GUIDED_SAMPLE_PACKS } from './generatedMobile/guidedSamplePacks.js';
import { getGuidedSampleContent, getGuidedSampleRootTitles, getMobileGuidedSampleContent } from './guidedSampleContent.js';

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

it('gives phones their own touch-only sample with the same topics in every app locale', () => {
  expect(Object.keys(MOBILE_GENERATED_GUIDED_SAMPLE_PACKS)).toEqual(APP_LOCALES);
  const rootTitles = getGuidedSampleRootTitles();
  for (const locale of APP_LOCALES) {
    const desktop = getGuidedSampleContent(locale);
    const mobile = getMobileGuidedSampleContent(locale);
    const topics = [mobile.root, ...mobile.children];
    expect(topics.map((topic) => topic.id)).toEqual([desktop.root, ...desktop.children].map((topic) => topic.id));
    expect(topics.every((topic) => topic.attachmentIds.length === 0 && !topic.content.includes('asset://'))).toBe(true);
    // Desktop recognizes a phone sample that synced to it, so it never adds a second one.
    expect(rootTitles.has(mobile.rootTitle)).toBe(true);
    for (const topic of topics) expect(topic.content).not.toMatch(/Alt \+|Option \+|[(（][^)）]*\b[1-4]\b[^)）]*[)）]/);
  }
});
