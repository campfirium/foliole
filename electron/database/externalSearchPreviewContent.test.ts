import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveExternalPreviewSourceContent, rewriteExternalPreviewContent } from './externalSearchPreviewContent.js';

const tempRoots: string[] = [];

async function createTempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-external-preview-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await import('node:fs/promises').then(({ rm }) => rm(root, { force: true, recursive: true }));
    })
  );
});

function createFolderConfig(root: string) {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root' as const,
    attachment_root_path: path.join(root, 'attachments'),
    created_at: '',
    document_count: 0,
    excluded_dirs: [],
    folder_path: root,
    id: 'folder-1',
    indexed_at: null,
    last_error: null,
    status: 'idle' as const,
    updated_at: ''
  };
}

describe('rewriteExternalPreviewContent', () => {
  it('rewrites relative markdown images to file urls using the note folder first', async () => {
    const root = await createTempRoot();
    const noteDir = path.join(root, 'notes');
    const imageDir = path.join(noteDir, 'images');
    await mkdir(imageDir, { recursive: true });
    await writeFile(path.join(imageDir, 'cover.png'), 'png');

    expect(
      rewriteExternalPreviewContent('![Cover](images/cover.png)', path.join(noteDir, 'topic.md'), createFolderConfig(root))
    ).toBe('![Cover](data:image/png;base64,cG5n)');
  });

  it('rewrites obsidian embeds to file urls using the attachment folder fallback', async () => {
    const root = await createTempRoot();
    const noteDir = path.join(root, 'notes');
    const attachmentDir = path.join(root, 'attachments');
    await mkdir(noteDir, { recursive: true });
    await mkdir(attachmentDir, { recursive: true });
    await writeFile(path.join(attachmentDir, 'Pasted image.png'), 'png');

    expect(
      rewriteExternalPreviewContent('![[Pasted image.png]]', path.join(noteDir, 'topic.md'), createFolderConfig(root))
    ).toBe('![Pasted image](data:image/png;base64,cG5n)');
  });

  it('leaves unresolved references unchanged', async () => {
    const root = await createTempRoot();
    const noteDir = path.join(root, 'notes');
    await mkdir(noteDir, { recursive: true });

    expect(rewriteExternalPreviewContent('![Doc](linked-note.md)', path.join(noteDir, 'topic.md'), null)).toBe(
      '![Doc](linked-note.md)'
    );
  });

  it('prefers live file content over stale cached content', async () => {
    const root = await createTempRoot();
    const noteDir = path.join(root, 'notes');
    const notePath = path.join(noteDir, 'topic.md');
    await mkdir(noteDir, { recursive: true });
    await writeFile(notePath, '# Live content\n\n![[Pasted image.png]]');

    expect(resolveExternalPreviewSourceContent('# Stale cached content', notePath)).toBe('# Live content\n\n![[Pasted image.png]]');
  });

  it('falls back to cached content when the live file cannot be read', async () => {
    const root = await createTempRoot();
    const notePath = path.join(root, 'missing.md');

    expect(resolveExternalPreviewSourceContent('# Cached content', notePath)).toBe('# Cached content');
  });
});
