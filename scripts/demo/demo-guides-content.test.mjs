import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDemoGuidesContent, parseGuideOutline } from './demo-guides-content.ts';

async function withContentFixture(test) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'foliole-demo-guides-'));
  try {
    await mkdir(path.join(dir, 'en'), { recursive: true });
    await mkdir(path.join(dir, 'zh-hans'), { recursive: true });
    await writeFile(path.join(dir, 'guide.yml'), 'alpha-topic\n  alpha-child\n  alpha-recall, item\nbeta-topic\n', 'utf8');
    await writeFile(path.join(dir, 'en', 'alpha-topic.md'), '# Alpha Topic\n\nEnglish summary.\n\n## Read\n\nEnglish body.', 'utf8');
    await writeFile(path.join(dir, 'en', 'alpha-topic.alpha-child.md'), '# Alpha Child\n\nChild summary.\nSecond child line.', 'utf8');
    await writeFile(path.join(dir, 'en', 'alpha-topic.alpha-recall.md'), '# Alpha Recall\n\nEnglish prompt?\n\n---\n\nEnglish answer.', 'utf8');
    await writeFile(path.join(dir, 'en', 'beta-topic.md'), '# Beta Topic\n\nFallback summary.\n\n## Keep\n\nFallback body.', 'utf8');
    await writeFile(path.join(dir, 'zh-hans', 'alpha-topic.md'), '# 中文主题\n\n中文摘要。\n\n## 阅读\n\n中文正文。', 'utf8');
    await writeFile(path.join(dir, 'zh-hans', 'alpha-topic.alpha-recall.md'), '# 中文回忆\n\n中文问题？\n\n---\n\n中文答案。', 'utf8');
    return await test({ dir, outputPath: path.join(dir, 'generated', 'demoPacks.ts') });
  } finally {
    await rm(dir, { force: true, recursive: true }).catch(() => undefined);
  }
}

describe('Demo Guides content source', () => {
  it('parses guide.yml order and item nesting', () => {
    const entries = parseGuideOutline('first-topic\n  first-child\n  first-item, item\nsecond-topic\n');

    expect(entries.map((entry) => entry.slug)).toEqual(['first-topic', 'second-topic']);
    expect(entries[0].children[0]).toMatchObject({ parentId: 'first-topic', slug: 'first-child', type: 'topic' });
    expect(entries[0].children[1]).toMatchObject({ parentId: 'first-topic', slug: 'first-item', type: 'item' });
  });

  it('builds locale packs with English fallback for missing locale files', async () => {
    await withContentFixture(async ({ dir, outputPath }) => {
      const packs = await buildDemoGuidesContent({ contentRoot: dir, outputPath });

      expect(packs.en.topics.map((topic) => topic.slug)).toEqual(['alpha-topic', 'alpha-topic.alpha-child', 'beta-topic']);
      expect(packs.en.topics[0]).toMatchObject({
        childTopicIds: ['alpha-topic.alpha-child'],
        id: 'alpha-topic',
        parentId: null
      });
      expect(packs.en.topics[1]).toMatchObject({
        id: 'alpha-topic.alpha-child',
        parentId: 'alpha-topic'
      });
      expect(packs['zh-hans'].topics[0]).toMatchObject({ id: 'alpha-topic', title: '中文主题' });
      expect(packs['zh-hans'].topics[0].reviewItems[0]).toMatchObject({ id: 'alpha-topic.alpha-recall', prompt: '中文问题？' });
      expect(packs['zh-hans'].topics[1]).toMatchObject({ id: 'alpha-topic.alpha-child', slug: 'alpha-topic.alpha-child', title: 'Alpha Child' });
      expect(packs['zh-hans'].topics[1].blocks).toEqual([{
        id: 'alpha-topic.alpha-child-block-1',
        kind: 'paragraph',
        text: 'Child summary.\nSecond child line.'
      }]);
      expect(packs['zh-hans'].topics[2]).toMatchObject({ id: 'beta-topic', title: 'Beta Topic' });
      expect(packs['zh-hans'].source.warnings).toContain('fallback-en: alpha-topic.alpha-child');
      expect(packs['zh-hans'].source.warnings).toContain('fallback-en: beta-topic');
      await expect(readFile(outputPath, 'utf8')).resolves.toContain('GENERATED_DEMO_PACKS');
    });
  });

  it('rejects children under review items', () => {
    expect(() => parseGuideOutline('first-topic\n  first-item, item\n    nested-topic\n')).toThrow('Guide item cannot have children');
  });
});
