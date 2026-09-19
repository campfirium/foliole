import { expect, it } from 'vitest';

import { recoverArticleImage } from '../../lib/core/import/articleImageRecovery';
import { replaceArticleImageSource } from '../../lib/core/import/replaceArticleImageSource';
import { createArticleImageSourceFixture } from '../../tests/fixtures/s203/articleImageSourceFixture';

it.each(['existing', 'same', 'changed', 'failed', 'local'] as const)(
  'records the source requests made by the actual shared recovery decision: %s', async (scenario) => {
    const source = createArticleImageSourceFixture('https://images.example/', scenario);
    const fixture = source.fixture;
    let article = { content: fixture.nodes[0]!.content, imageSources: fixture.nodes[0]!.imageSources };
    const result = await recoverArticleImage({ storageKey: fixture.originalKey, replaceSource: replaceArticleImageSource,
      port: {
        read: async () => article,
        exists: async () => fixture.initialFiles.length > 0,
        importImage: async (url) => {
          const response = source.respond(url);
          if (!response.ok) return null;
          expect(Buffer.from(await response.arrayBuffer())).toEqual(fixture.response.bytes);
          return fixture.expectedKey;
        },
        commit: async (_before, after) => { article = after; return true; }
      } });
    expect(source.snapshot()).toHaveLength(['existing', 'local'].includes(scenario) ? 0 : 1);
    expect(article.content).toBe(fixture.expectedContent);
    expect(Boolean(result)).toBe(!['failed', 'local'].includes(scenario));
    if (scenario === 'changed') expect(fixture.nodes[1]!.content).toContain(fixture.originalKey);
  }
);

it('rejects unsafe origins and unrelated requests without starting a server', () => {
  for (const origin of ['http://images.example/', 'https://127.0.0.1/', 'https://localhost/', 'https://name:secret@images.example/']) {
    expect(() => createArticleImageSourceFixture(origin, 'same')).toThrow();
  }
  const source = createArticleImageSourceFixture('https://images.example/', 'same');
  expect(() => source.respond('https://elsewhere.example/s203/same.png')).toThrow('outside');
  expect(() => source.respond(new Request(source.fixture.sourceUrl, { method: 'POST' }))).toThrow('outside');
  expect(source.snapshot()).toEqual([]);
});
