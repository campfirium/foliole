// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RELEASE_COMPLETION_ITEMS,
  assertReleaseComplete,
  buildReleaseCompletionChecklist,
  formatReleaseCompletionChecklist
} from './release-completion-checklist.mjs';

function completeEvidence() {
  return Object.fromEntries(RELEASE_COMPLETION_ITEMS.map(([key]) => [key, true]));
}

describe('release completion checklist', () => {
  it('fails completion when any required release evidence is missing', () => {
    const checklist = buildReleaseCompletionChecklist({
      evidence: { ...completeEvidence(), githubReleasePublic: false },
      version: '0.6.4'
    });

    expect(formatReleaseCompletionChecklist(checklist)).toContain('[ ] GitHub release is public');
    expect(() => assertReleaseComplete(checklist)).toThrow('GitHub release is public');
  });

  it('passes only when every required release wrap-up item is proven', () => {
    const checklist = buildReleaseCompletionChecklist({
      evidence: completeEvidence(),
      version: '0.6.4'
    });

    expect(assertReleaseComplete(checklist)).toBe(true);
    expect(formatReleaseCompletionChecklist(checklist)).toContain('[x] installer asset exists');
    expect(formatReleaseCompletionChecklist(checklist)).toContain('script does not independently query public URLs');
  });

  it('keeps body, assets, manifest, and external announcement as separate required items', () => {
    const labels = RELEASE_COMPLETION_ITEMS.map(([, label]) => label);

    expect(labels).toContain('GitHub release body contains approved notes');
    expect(labels).toContain('installer asset exists');
    expect(labels).toContain('SHA256 asset exists');
    expect(labels).toContain('update manifest public URL reports latest version');
    expect(labels).toContain('external announcement Markdown exists');
  });

  it('detects the external announcement from release-artifacts by default', async () => {
    const artifactsDir = await mkdtemp(path.join(os.tmpdir(), 'release-completion-'));
    try {
      await mkdir(artifactsDir, { recursive: true });
      await writeFile(path.join(artifactsDir, 'foliole-v0.6.4-announcement.md'), 'announcement', 'utf8');
      const checklist = buildReleaseCompletionChecklist({
        artifactsDir,
        evidence: { ...completeEvidence(), externalAnnouncementMarkdownExists: false },
        version: '0.6.4'
      });

      expect(checklist.find((item) => item.key === 'externalAnnouncementMarkdownExists')?.ok).toBe(false);
      expect(
        buildReleaseCompletionChecklist({
          artifactsDir,
          evidence: completeEvidence(),
          version: '0.6.4'
        }).find((item) => item.key === 'externalAnnouncementMarkdownExists')?.ok
      ).toBe(true);
    } finally {
      await rm(artifactsDir, { force: true, recursive: true });
    }
  });

  it('can read local announcement evidence from a custom artifacts directory', async () => {
    const artifactsDir = await mkdtemp(path.join(os.tmpdir(), 'release-completion-custom-'));
    try {
      await writeFile(path.join(artifactsDir, 'foliole-v0.6.4-announcement.md'), 'announcement', 'utf8');
      const checklist = buildReleaseCompletionChecklist({
        artifactsDir,
        evidence: completeEvidence(),
        version: '0.6.4'
      });

      expect(checklist.find((item) => item.key === 'externalAnnouncementMarkdownExists')?.ok).toBe(true);
    } finally {
      await rm(artifactsDir, { force: true, recursive: true });
    }
  });
});
