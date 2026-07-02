// @vitest-environment node

import fs from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatExternalAnnouncement,
  formatGithubBody,
  writeReleaseCopySurfaces
} from './release-copy-surfaces.mjs';

describe('release copy surfaces', () => {
  it('formats the GitHub body with approved English notes instead of a placeholder-only body', () => {
    const body = formatGithubBody([
      'Improved',
      'The Quick Capture panel can now be moved by dragging it.',
      'Fixed',
      'Imported PDFs can now be previewed and read normally.'
    ]);

    expect(body).toContain('### Improved');
    expect(body).toContain('- The Quick Capture panel can now be moved by dragging it.');
    expect(body).toContain('### Fixed');
    expect(body).not.toContain('Windows alpha; please use test data and keep your own backup.');
    expect(body.trim()).not.toBe('');
  });

  it('formats the external announcement as a Chinese forum post plus English Twitter/X post', () => {
    const announcement = formatExternalAnnouncement({
      enNotes: ['Improved', 'Quick Capture is easier to use.'],
      version: '0.6.4',
      zhNotes: ['优化', '快速捕获现在更容易使用。']
    });

    expect(announcement).toContain('# 中文论坛帖');
    expect(announcement).toContain('## 更新 v0.6.4');
    expect(announcement).toContain('### 优化');
    expect(announcement).toContain('- 快速捕获现在更容易使用。');
    expect(announcement).toContain('# English Twitter/X Post');
    expect(announcement).toContain('Main post:\n\nFoliole v0.6.4 for Windows is available.');
    expect(announcement).toContain('Foliole v0.6.4 for Windows is available.');
    expect(announcement).toContain('Quick Capture is easier to use.\n\nhttps://github.com/campfirium/foliole/releases/tag/v0.6.4');
    expect(announcement).not.toContain('- Quick Capture is easier to use.');
    expect(announcement).not.toContain('\n\nReply:\n\n');
    const mainPost = announcement.match(/Main post:\n\n(?<body>[\s\S]*)$/u)?.groups?.body.trimEnd() ?? '';
    const xCount = mainPost.replace(/https:\/\/\S+/gu, 'x'.repeat(23)).length;
    expect(xCount).toBeLessThanOrEqual(280);
  });

  it('writes both release copy artifacts from the notes catalogs', async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'release-copy-surfaces-'));
    const postingFile = path.join(outDir, 'change', '0.6.4.md');
    try {
      const result = writeReleaseCopySurfaces({ outDir, postingFile, version: '0.6.4' });

      expect(fs.existsSync(result.githubBodyPath)).toBe(true);
      expect(fs.existsSync(result.announcementPath)).toBe(true);
      expect(result.postingPath).toBe(postingFile);
      expect(fs.existsSync(postingFile)).toBe(true);
      await expect(readFile(result.githubBodyPath, 'utf8')).resolves.toContain('### Fixed');
      await expect(readFile(result.announcementPath, 'utf8')).resolves.toContain('# 中文论坛帖');
      await expect(readFile(postingFile, 'utf8')).resolves.toContain('## 更新 v0.6.4');
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  });
});
