// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: mockedAppDataDir })
}));

import { persistAssistantImages, readAssistantImageContent } from '../assistant/assistantImageStorage.js';
import { validateAssistantImageDrafts } from '../assistant/assistantImageValidation.js';

import { closeAssistantHistoryConnection } from './assistantHistoryConnection.js';
import {
  deleteUnreferencedAssistantImageAttachments,
  listAssistantThreadAttachmentIds
} from './assistantThreadImages.js';
import { upsertAssistantThreadIndex } from './assistantThreadIndex.js';
import { appendAssistantThreadMessages, deleteAssistantThreadMessages, listAssistantThreadMessages } from './assistantThreadMessages.js';

let tempRoot = '';
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-aide-images-'));
  mockedAppDataDir = path.join(tempRoot, 'user-data');
});

afterEach(async () => {
  closeAssistantHistoryConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('persists image metadata with a message and reads content by attachment id', async () => {
  seedThread();
  const [stored] = await persistAssistantImages(validateAssistantImageDrafts([draft()]));
  appendAssistantThreadMessages([{
    id: 'turn-1:user',
    images: stored ? [stored] : [],
    provider: 'codex-app-server',
    providerThreadId: 'thread-1',
    role: 'user',
    text: 'Inspect this'
  }]);

  expect(listAssistantThreadMessages('codex-app-server', 'thread-1')).toEqual([
    expect.objectContaining({ images: [expect.objectContaining({ id: stored?.id })] })
  ]);
  await expect(readAssistantImageContent(stored?.id ?? '')).resolves.toEqual({
    attachmentId: stored?.id,
    contentBase64: pngBytes.toString('base64'),
    mimeType: 'image/png',
    status: 'ready'
  });
});

it('keeps shared metadata until the final message reference is removed', async () => {
  seedThread('thread-1');
  seedThread('thread-2');
  const [stored] = await persistAssistantImages(validateAssistantImageDrafts([draft()]));
  for (const threadId of ['thread-1', 'thread-2']) {
    appendAssistantThreadMessages([{
      id: `${threadId}:user`,
      images: stored ? [stored] : [],
      provider: 'codex-app-server',
      providerThreadId: threadId,
      role: 'user',
      text: 'Shared'
    }]);
  }
  const attachmentId = stored?.id ?? '';

  deleteAssistantThreadMessages('codex-app-server', 'thread-1');
  expect(deleteUnreferencedAssistantImageAttachments([attachmentId])).toEqual([]);
  expect(listAssistantThreadAttachmentIds('codex-app-server', 'thread-2')).toEqual([attachmentId]);

  deleteAssistantThreadMessages('codex-app-server', 'thread-2');
  expect(deleteUnreferencedAssistantImageAttachments([attachmentId])).toEqual([
    expect.objectContaining({ id: attachmentId })
  ]);
});

function seedThread(providerThreadId = 'thread-1') {
  upsertAssistantThreadIndex({
    location: { type: 'workspace' },
    message: 'Prompt',
    provider: 'codex-app-server',
    providerThreadId
  });
}

function draft() {
  return {
    contentBase64: pngBytes.toString('base64'),
    mimeType: 'image/png',
    originalName: 'screen.png',
    sizeBytes: pngBytes.byteLength
  };
}
