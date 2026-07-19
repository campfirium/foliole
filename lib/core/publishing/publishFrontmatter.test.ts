import { describe, expect, it } from 'vitest';

import {
  DiscourseFrontmatterError,
  readDiscourseTopicBinding,
  writeDiscourseTopicBinding
} from '../discourse/discourseFrontmatter.js';
import { readWordPressPostBinding, writeWordPressPostBinding } from '../wordpress/wordpressFrontmatter.js';

const discourseBinding = {
  categoryId: 12,
  lastPublishedAt: '2026-07-19T08:00:00.000Z',
  postId: 1050,
  site: 'https://forum.campfirium.com',
  tags: ['overseas', 'two words'],
  topicId: 874,
  url: 'https://forum.campfirium.com/t/example/874'
};

const wordpressBinding = {
  adapter: 'core_rest' as const,
  lastPublishedAt: '2026-07-19T08:00:00.000Z',
  postId: '42',
  site: 'https://example.wordpress.com',
  url: 'https://example.wordpress.com/post'
};

describe('Foliole publish frontmatter document updates', () => {
  it('preserves user YAML bytes and CRLF while adding the publish subtree', () => {
    const userFrontmatter = 'alias: sample\r\n# keep this comment\r\ntags: [software, indie]';
    const content = `---\r\n${userFrontmatter}\r\n---\r\n# Title\r\n\r\nBody`;
    const updated = writeDiscourseTopicBinding(content, discourseBinding);

    expect(updated.startsWith(`---\r\n${userFrontmatter}\r\nfoliole:`)).toBe(true);
    expect(updated.endsWith('---\r\n# Title\r\n\r\nBody')).toBe(true);
    expect(updated.replace(/\r\n/gu, '')).not.toContain('\n');
    expect(readDiscourseTopicBinding(updated)).toEqual(discourseBinding);
  });

  it('updates one provider without changing sibling or surrounding source bytes', () => {
    const withBoth = writeWordPressPostBinding(
      writeDiscourseTopicBinding('---\nalias: sample\n---\nBody', discourseBinding),
      wordpressBinding
    );
    const beforeWordPress = withBoth.slice(withBoth.indexOf('    wordpress:'));
    const updated = writeDiscourseTopicBinding(withBoth, { ...discourseBinding, topicId: 999 });

    expect(updated.slice(updated.indexOf('    wordpress:'))).toBe(beforeWordPress);
    expect(readDiscourseTopicBinding(updated)?.topicId).toBe(999);
    expect(readWordPressPostBinding(updated)).toEqual(wordpressBinding);
  });

  it('adds publish below an existing Foliole block without rewriting sibling data', () => {
    const content = '---\nfoliole:\n  other: { keep: "exact" } # untouched\ncustom: >\n  line\n---\nBody';
    const updated = writeWordPressPostBinding(content, wordpressBinding);

    expect(updated).toContain('  other: { keep: "exact" } # untouched\n');
    expect(updated).toContain('custom: >\n  line\n---\nBody');
    expect(readWordPressPostBinding(updated)).toEqual(wordpressBinding);
  });

  it('fails closed for invalid YAML and unsupported Foliole mapping styles', () => {
    expect(() => writeDiscourseTopicBinding('---\n[invalid\n---\nBody', discourseBinding))
      .toThrow(DiscourseFrontmatterError);
    expect(() => writeDiscourseTopicBinding('---\nfoliole: { other: true }\n---\nBody', discourseBinding))
      .toThrow('block mapping style');
  });

  it('rejects unknown provider fields and multiline write values', () => {
    const unknownField = writeDiscourseTopicBinding('# Title', discourseBinding)
      .replace('      topicId: 874', '      topicId: 874\n      unexpected: true');
    expect(() => readDiscourseTopicBinding(unknownField)).toThrow('incomplete');
    expect(() => writeDiscourseTopicBinding('# Title', { ...discourseBinding, site: 'bad\nsite' }))
      .toThrow('incomplete');
  });

  it('does not mistake legacy marker text in the Topic body for frontmatter', () => {
    const content = '# Title\n\n`# foliole:discourse-publish`';
    expect(() => writeDiscourseTopicBinding(content, discourseBinding)).not.toThrow();
  });
});
