import { mkdir } from 'node:fs/promises';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const TOPIC_ID = 'playwright-discourse-published-meta';
const TOPIC_CONTENT = [
  '---',
  'foliole:',
  '  publish:',
  '    schemaVersion: 1',
  '    discourse:',
  '      site: https://forum.campfirium.com',
  '      topicId: 869',
  '      postId: 1041',
  '      url: https://forum.campfirium.com/t/topic/869',
  '      categoryId: 5',
  '      tags:',
  '        - health',
  '      lastPublishedAt: "2026-07-05T03:10:07.438Z"',
  '---',
  '# Published meta sample',
  '',
  'Body text.'
].join('\n');

test('shows Discourse published date metadata in the desktop editor', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async ({ content, topicId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{
      content,
      id: topicId,
      kind: 'topic',
      title: 'Published meta sample'
    }]);
    await api?.openNode?.(topicId);
  }, { content: TOPIC_CONTENT, topicId: TOPIC_ID });

  const publishedMeta = desktopWindow.locator('.prompt-editor-host .cm-md-frontmatter-meta-link');
  const metaToggle = desktopWindow.locator('.prompt-editor-host .cm-md-frontmatter-toggle');
  await expect(publishedMeta).toHaveText(/^(Posted|发布|發布) .+/);
  await expect(publishedMeta).toHaveAttribute('data-md-link-url', 'https://forum.campfirium.com/t/topic/869');
  await expect(metaToggle).toHaveText('meta');

  await mkdir('.tmp/artifacts', { recursive: true });
  const screenshot = await desktopWindow.screenshot({
    fullPage: false,
    path: '.tmp/artifacts/discourse-published-meta-hidden-native.png'
  });
  await testInfo.attach('discourse-published-meta', {
    body: screenshot,
    contentType: 'image/png'
  });
});
