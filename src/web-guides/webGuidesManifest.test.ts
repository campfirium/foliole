// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createWebGuideManifestGuide,
  createWebGuidesManifest,
  stableJson,
  WEB_GUIDES_MANIFEST_FILE
} from './webGuidesManifest';

const guide = {
  slug: 'focused-reading-review',
  title: 'Focused reading and review',
  description: 'A practical guide to reading, extracting, and reviewing topics in Foliole.',
  summary: 'Build a quiet loop.',
  sections: [{ heading: 'Start with one source topic', body: ['Choose one topic.'] }]
};

describe('Web Guides manifest contract', () => {
  it('projects static guide metadata into the v1 manifest schema', () => {
    const manifestGuide = createWebGuideManifestGuide(guide);

    expect(WEB_GUIDES_MANIFEST_FILE).toBe('guides-manifest.json');
    expect(manifestGuide).toMatchObject({
      slug: guide.slug,
      title: guide.title,
      description: guide.description,
      canonicalPath: '/guides/focused-reading-review/'
    });
    expect(manifestGuide.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('keeps build hash stable across generated timestamps', () => {
    const assets = [
      { path: 'assets/index-b.css', type: 'style' as const },
      { path: 'assets/index-a.js', type: 'script' as const }
    ];
    const first = createWebGuidesManifest({ assets, generatedAt: '2026-06-10T00:00:00.000Z', guides: [guide] });
    const second = createWebGuidesManifest({ assets, generatedAt: '2026-06-11T00:00:00.000Z', guides: [guide] });

    expect(first.buildHash).toBe(second.buildHash);
    expect(first.runtime.assets.map((asset) => asset.path)).toEqual(['assets/index-a.js', 'assets/index-b.css']);
  });

  it('uses stable JSON ordering for hash inputs', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});
