import { expect, it } from 'vitest';

import { readDiscourseTopicBinding } from '../discourse/discourseFrontmatter.js';
import { readWordPressPostBinding } from '../wordpress/wordpressFrontmatter.js';

import {
  LegacyPublishFrontmatterMigrationError,
  migrateLegacyPublishFrontmatter
} from './legacyPublishFrontmatterMigration.js';

const legacyContent = [
  '---',
  'alias: sample',
  '# foliole:discourse-publish',
  'publish:',
  '  discourse:',
  '    site: https://forum.example.com',
  '    topicId: 874',
  '    postId: 1050',
  '    url: https://forum.example.com/t/example/874',
  '    categoryId: 12',
  '    tags:',
  '      - overseas',
  '    lastPublishedAt: 2026-07-19T08:00:00.000Z',
  '# /foliole:discourse-publish',
  '# foliole:wordpress-publish',
  'wordpressPublish:',
  '  site: https://example.wordpress.com',
  '  adapter: core_rest',
  '  postId: 42',
  '  url: https://example.wordpress.com/post',
  '  lastPublishedAt: 2026-07-19T08:00:00.000Z',
  '# /foliole:wordpress-publish',
  '---',
  '# Title'
].join('\n');

it('converts legacy marker blocks once without joining the normal read path', () => {
  const migrated = migrateLegacyPublishFrontmatter(legacyContent);

  expect(migrated).not.toContain('foliole:discourse-publish');
  expect(migrated).not.toContain('foliole:wordpress-publish');
  expect(migrated).toContain('alias: sample');
  expect(readDiscourseTopicBinding(migrated)).toMatchObject({ topicId: 874, tags: ['overseas'] });
  expect(readWordPressPostBinding(migrated)).toMatchObject({ postId: '42' });
  expect(migrateLegacyPublishFrontmatter(migrated)).toBe(migrated);
});

it('rejects malformed legacy markers', () => {
  expect(() => migrateLegacyPublishFrontmatter('---\n# foliole:discourse-publish\n---\nBody'))
    .toThrow(LegacyPublishFrontmatterMigrationError);
});
