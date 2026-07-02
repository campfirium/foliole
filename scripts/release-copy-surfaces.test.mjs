// @vitest-environment node

import fs from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
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

  it('writes the GitHub release body from the notes catalog', async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'release-copy-surfaces-'));
    try {
      const result = writeReleaseCopySurfaces({ outDir, version: '0.6.4' });

      expect(fs.existsSync(result.githubBodyPath)).toBe(true);
      await expect(readFile(result.githubBodyPath, 'utf8')).resolves.toContain('### Fixed');
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  });
});
