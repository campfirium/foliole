import { expect, it } from 'vitest';

import {
  readFolioleWebBinding,
  readFolioleWebMarkdown,
  readFolioleWebYamlCandidates,
  writeFolioleWebBinding
} from './folioleWebPublishFrontmatter.js';

it('preserves user YAML while writing ordered fields including empty values', () => {
  const input = '---\r\ntitle: Existing # keep\r\ntags:\r\n  - one\r\n---\r\nBody';
  const output = writeFolioleWebBinding(input, {
    fields: [{ key: 'summary', value: '' }, { key: 'topics', value: [] }],
    lastPublishedAt: '2026-07-20T00:00:00.000Z', pageId: 'page-1', site: 'https://example.com', url: 'https://example.com/cards/page-1.html'
  });
  expect(output).toContain('title: Existing # keep\r\n');
  expect(output).toContain('summary: ""\r\n');
  expect(readFolioleWebBinding(output)?.fields).toEqual([{ key: 'summary', value: '' }, { key: 'topics', value: [] }]);
});

it('offers only supported top-level YAML values without changing them', () => {
  const content = '---\ntitle: Hello\ntags: [one, two]\ndraft: true\nnested:\n  value: no\nfoliole: {}\n---\nBody';
  expect(readFolioleWebYamlCandidates(content)).toEqual([
    { key: 'title', value: 'Hello' },
    { key: 'tags', value: ['one', 'two'] }
  ]);
  expect(content).toContain('draft: true');
});

it('rejects duplicate and invalid field keys', () => {
  expect(() => writeFolioleWebBinding('Body', {
    fields: [{ key: 'bad key', value: 'x' }],
    lastPublishedAt: 'now', pageId: 'id', site: 'site', url: 'url'
  })).toThrow('unique YAML identifiers');
});

it('removes the opening Topic title from published Markdown', () => {
  const content = '---\r\ncategory: essay\r\n---\r\n# Publish once\r\n\r\nBody\r\n\r\n# Keep this section';
  expect(readFolioleWebMarkdown(content)).toBe('Body\r\n\r\n# Keep this section');
});
