import { describe, expect, it } from 'vitest';

import {
  DiscourseFrontmatterError,
  readDiscoursePublishMarkdown,
  readDiscourseTopicBinding,
  resolveDiscoursePublishMode,
  writeDiscourseTopicBinding
} from '../../../lib/core/discourse/discourseFrontmatter';

const binding = {
  categoryId: 7,
  lastPublishedAt: '2026-07-02T00:00:00.000Z',
  postId: 456,
  site: 'https://forum.example.com',
  tags: ['foliole', 'notes'],
  topicId: 123,
  url: 'https://forum.example.com/t/example/123'
};

describe('Discourse publish frontmatter', () => {
  it('creates a managed publish binding without changing the body', () => {
    const updated = writeDiscourseTopicBinding('# Title\n\nBody', binding);
    expect(updated).toContain('foliole:\n  publish:\n    schemaVersion: 1\n    discourse:');
    expect(updated).toContain('topicId: 123');
    expect(updated).toContain('lastPublishedAt: "2026-07-02T00:00:00.000Z"');
    expect(updated.endsWith('# Title\n\nBody')).toBe(true);
    expect(readDiscourseTopicBinding(updated)).toEqual(binding);
    expect(resolveDiscoursePublishMode(updated)).toBe('update');
  });

  it('preserves existing frontmatter and publishes only markdown body', () => {
    const updated = writeDiscourseTopicBinding('---\nauthor: Ada\n---\n# Title\n\nBody', binding);
    expect(updated).toContain('author: Ada');
    expect(readDiscoursePublishMarkdown(updated)).toBe('Body');
  });

  it('keeps local markdown intact while omitting the opening H1 from the publish body', () => {
    const content = '# Title\n\n## Section\n\nBody';
    expect(writeDiscourseTopicBinding(content, binding).endsWith(content)).toBe(true);
    expect(readDiscoursePublishMarkdown(content)).toBe('## Section\n\nBody');
  });

  it('updates the managed binding in place', () => {
    const first = writeDiscourseTopicBinding('# Title', binding);
    const second = writeDiscourseTopicBinding(first, { ...binding, topicId: 999, postId: 1000 });
    expect(second.match(/discourse:/g)).toHaveLength(1);
    expect(readDiscourseTopicBinding(second)?.topicId).toBe(999);
  });

  it('keeps user-owned publish frontmatter independent', () => {
    expect(readDiscourseTopicBinding('---\npublish:\n  other: true\n---\nBody')).toBeNull();
  });

  it('fails closed for unknown Foliole publish schema versions', () => {
    const content = '---\nfoliole:\n  publish:\n    schemaVersion: 2\n    discourse: {}\n---\nBody';
    expect(() => readDiscourseTopicBinding(content)).toThrow(DiscourseFrontmatterError);
  });
});
