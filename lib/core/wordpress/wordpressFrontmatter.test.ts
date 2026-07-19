import { expect, it } from 'vitest';

import { readDiscourseTopicBinding, writeDiscourseTopicBinding } from '../discourse/discourseFrontmatter.js';

import { readWordPressPostBinding, writeWordPressPostBinding } from './wordpressFrontmatter.js';

const wordpressBinding = {
  adapter: 'wordpress_com_xmlrpc' as const,
  lastPublishedAt: '2026-07-16T00:00:00.000Z',
  postId: '42',
  site: 'https://free-site.wordpress.com',
  url: 'https://free-site.wordpress.com/post'
};

const discourseBinding = {
  categoryId: 2,
  lastPublishedAt: '2026-07-16T00:00:00.000Z',
  postId: 4,
  site: 'https://forum.example.com',
  tags: ['notes'],
  topicId: 3,
  url: 'https://forum.example.com/t/topic/3'
};

it('writes WordPress below the shared Foliole publish namespace', () => {
  const content = writeWordPressPostBinding('# Title\n\nBody', wordpressBinding);
  expect(content).toContain('\nfoliole:\n  publish:\n    schemaVersion: 1\n    wordpress:\n');
  expect(content).toContain('postId: "42"');
  expect(readWordPressPostBinding(content)).toEqual(wordpressBinding);
});

it('keeps WordPress-only and Discourse-only bindings independent', () => {
  const wordpressOnly = writeWordPressPostBinding('# Title', wordpressBinding);
  const discourseOnly = writeDiscourseTopicBinding('# Title', discourseBinding);

  expect(readDiscourseTopicBinding(wordpressOnly)).toBeNull();
  expect(readWordPressPostBinding(discourseOnly)).toBeNull();
});

it('preserves both provider bindings in the same Topic', () => {
  const content = writeWordPressPostBinding(
    writeDiscourseTopicBinding('# Title\n\nBody', discourseBinding),
    wordpressBinding
  );

  expect(readDiscourseTopicBinding(content)).toEqual(discourseBinding);
  expect(readWordPressPostBinding(content)).toEqual(wordpressBinding);
});

it('replaces only the existing WordPress binding', () => {
  const content = writeWordPressPostBinding('# Title', wordpressBinding);
  const updated = writeWordPressPostBinding(content, { ...wordpressBinding, postId: '84' });
  expect(readWordPressPostBinding(updated)?.postId).toBe('84');
  expect(updated.match(/wordpress:/g)).toHaveLength(1);
});
