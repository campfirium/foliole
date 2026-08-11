// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { DemoTopic } from './demoContent';
import {
  createDemoManifest,
  createDemoManifestTopic,
  DEMO_PUBLISHED_LOCALES,
  DEMO_MANIFEST_FILE,
  stableJson,
} from './demoManifest';

const topic = {
  blocks: [
    { id: 'block-1', kind: 'heading' as const, text: 'Start with one source topic' },
    { id: 'block-2', kind: 'paragraph' as const, text: 'Choose one topic.' }
  ],
  childTopicIds: [],
  slug: 'welcome-to-foliole',
  title: 'Welcome to Foliole',
  description: 'Start by clicking Read, or press 3 / F',
  highlights: [],
  id: 'node-1',
  readingSeed: {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: { dayOffset: 0 },
    nextAt: { dayOffset: 0 },
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state: 'active' as const
  },
  reviewItems: [
    { answer: 'Use one clear recall.', id: 'item-1', kind: 'item' as const, prompt: 'How should review material stay small?', title: 'Review material' }
  ],
  reviewScheduleSeeds: [
    {
      difficulty: 0,
      due: { dayOffset: 1 },
      elapsedDays: 0,
      lapses: 0,
      lastReviewAt: null,
      reps: 0,
      reviewItemId: 'item-1',
      scheduledDays: 0,
      stability: 0,
      state: 0 as const
    }
  ],
  parentId: null,
  runtime: { state: 'topic' as const, topicId: 'node-1' },
  summary: 'Build a quiet loop.',
  sections: [{ heading: 'Start with one source topic', body: ['Choose one topic.'] }]
} satisfies DemoTopic;

describe('Demo manifest contract', () => {
  it('projects static Demo topic metadata into the v3 locale manifest schema', () => {
    const manifestTopic = createDemoManifestTopic(topic);

    expect(DEMO_MANIFEST_FILE).toBe('demo-manifest.json');
    expect(manifestTopic).toMatchObject({
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      locale: 'en',
      hreflang: 'en',
      canonicalPath: '/en/guides/welcome-to-foliole/',
      demoPath: '/en/demo/',
      xDefaultPath: '/en/guides/welcome-to-foliole/',
      sections: topic.sections,
      summary: topic.summary
    });
    expect(manifestTopic.alternates).toEqual(expect.arrayContaining([
      { locale: 'en', hreflang: 'en', path: '/en/guides/welcome-to-foliole/' },
      { locale: 'de', hreflang: 'de', path: '/de/guides/welcome-to-foliole/' },
      { locale: 'pt-br', hreflang: 'pt-BR', path: '/pt-br/guides/welcome-to-foliole/' },
      { locale: 'zh-hans', hreflang: 'zh-Hans', path: '/zh-hans/guides/welcome-to-foliole/' }
    ]));
    expect(manifestTopic.alternates).toHaveLength(12);
    expect(JSON.stringify(manifestTopic)).not.toContain('reviewScheduleSeeds');
    expect(JSON.stringify(manifestTopic)).not.toContain('dayOffset');
    expect(manifestTopic.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('keeps build hash stable across generated timestamps', () => {
    const assets = [
      { path: 'assets/index-b.css', type: 'style' as const },
      { path: 'assets/index-a.js', type: 'script' as const }
    ];
    const first = createDemoManifest({ assets, generatedAt: '2026-06-10T00:00:00.000Z', topics: [topic] });
    const second = createDemoManifest({ assets, generatedAt: '2026-06-11T00:00:00.000Z', topics: [topic] });

    expect(first.contractVersion).toBe(3);
    expect(first.publishedLocales).toEqual(DEMO_PUBLISHED_LOCALES);
    expect(first.localePublishPacks.map((pack) => pack.locale)).toHaveLength(12);
    expect(first.publishedLocales.map((locale) => locale.locale)).toHaveLength(12);
    expect(first.localePublishPacks.find((pack) => pack.locale === 'zh-hans')?.topics[0]).toMatchObject({
      locale: 'zh-hans', hreflang: 'zh-Hans', canonicalPath: '/zh-hans/guides/welcome-to-foliole/', demoPath: '/zh-hans/demo/'
    });
    expect(first.buildHash).toBe(second.buildHash);
    expect(first.runtime.assets.map((asset) => asset.path)).toEqual(['assets/index-a.js', 'assets/index-b.css']);
  });

  it('uses stable JSON ordering for hash inputs', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});
