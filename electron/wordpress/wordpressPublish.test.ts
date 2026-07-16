import { beforeEach, expect, it, vi } from 'vitest';

import { readWordPressPostBinding, writeWordPressPostBinding } from '../../lib/core/wordpress/wordpressFrontmatter.js';

const writeWordPressPost = vi.hoisted(() => vi.fn());
const settings = {
  adapter: 'core_rest' as const,
  blog_id: null,
  endpoint: 'https://blog.example.com/wp-json/wp/v2',
  site_url: 'https://blog.example.com',
  updated_at: '2026-07-16T00:00:00.000Z'
};
const credential = {
  adapter: 'core_rest' as const,
  applicationPassword: 'SENTINEL-WORDPRESS-SECRET',
  siteUrl: settings.site_url,
  username: 'writer'
};

vi.mock('./wordpressClient.js', () => ({ writeWordPressPost }));
vi.mock('./wordpressPublishSettings.js', () => ({
  connectWordPressPublishSettings: vi.fn(),
  disconnectWordPressPublishSettings: vi.fn(),
  loadStoredWordPressPublishSettings: () => settings,
  loadWordPressCredential: () => credential,
  loadWordPressPublishSettings: vi.fn()
}));

beforeEach(() => {
  writeWordPressPost.mockReset();
  writeWordPressPost.mockResolvedValue({ postId: '123', url: 'https://blog.example.com/post' });
});

it('creates a WordPress post and writes the provider-specific binding after success', async () => {
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  const result = await publishTopicToWordPress({
    content: '# Body Title\n\nHello **WordPress**.', status: 'draft', title: 'Topic title'
  });

  expect(writeWordPressPost).toHaveBeenCalledWith(expect.objectContaining({ siteUrl: settings.site_url }), {
    content: '<p>Hello <strong>WordPress</strong>.</p>', status: 'draft', title: 'Body Title'
  }, undefined);
  expect(result.mode).toBe('created');
  expect(readWordPressPostBinding(result.updated_content)).toMatchObject({ postId: '123', site: settings.site_url });
  expect(JSON.stringify(result)).not.toContain('SENTINEL-WORDPRESS-SECRET');
});

it('updates the same remote post id from the WordPress binding', async () => {
  const content = writeWordPressPostBinding('# Updated\n\nBody', {
    adapter: 'core_rest', lastPublishedAt: '2026-07-16T00:00:00.000Z', postId: '123',
    site: settings.site_url, url: 'https://blog.example.com/post'
  });
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  const result = await publishTopicToWordPress({ content, status: 'publish', title: 'Fallback' });

  expect(writeWordPressPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Updated' }), '123');
  expect(result.mode).toBe('updated');
  expect(result.post_id).toBe('123');
});

it('does not produce an updated binding when the remote write fails', async () => {
  writeWordPressPost.mockRejectedValue(new Error('remote rejected'));
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  await expect(publishTopicToWordPress({ content: '# Title\n\nBody', status: 'draft', title: 'Title' }))
    .rejects.toThrow('remote rejected');
});

it('rejects a binding owned by another site before sending content', async () => {
  const content = writeWordPressPostBinding('# Title\n\nBody', {
    adapter: 'core_rest', lastPublishedAt: '2026-07-16T00:00:00.000Z', postId: '456',
    site: 'https://other.example.com', url: 'https://other.example.com/post'
  });
  const { publishTopicToWordPress } = await import('./wordpressPublish.js');
  await expect(publishTopicToWordPress({ content, status: 'draft', title: 'Title' }))
    .rejects.toThrow('different WordPress site');
  expect(writeWordPressPost).not.toHaveBeenCalled();
});
