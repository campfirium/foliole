// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-images-tests';
const adapterSendMessage = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: { getPath: () => mockedAppDataDir, getVersion: () => '0.6.5-test' }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../assistant/codexAppServerAdapter.js', () => ({
  CodexAppServerAdapter: vi.fn(function CodexAppServerAdapter() {
    return { dispose: vi.fn(), getStatus: vi.fn(), sendMessage: adapterSendMessage };
  })
}));

vi.mock('./assistantAgentControlStatus.js', () => ({
  loadAssistantAgentControlContext: vi.fn(async () => ({
    capabilities: ['materials.read', 'materials.create'],
    state: 'running'
  })),
  mergeAssistantStatusWithAgentControl: vi.fn((status) => status)
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { openAssistantHistoryConnection } from '../database/assistantHistoryConnection.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { handleAssistantCommand, resetAssistantCommandAdapterForTests } from './assistantCommands.js';

const CONTENT_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  .toString('base64');
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-images-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('sends, stores, reads, and removes a validated image attachment', async () => {
  adapterSendMessage.mockResolvedValue(readyResult('thread-image', 'turn-image'));
  await sendImage('thread-image');

  expect(adapterSendMessage).toHaveBeenCalledWith(expect.objectContaining({
    imagePaths: [expect.stringMatching(/Workspace\/Attachments\/[a-f0-9]{64}\.png$/u)]
  }));
  const imagePath = adapterSendMessage.mock.lastCall?.[0].imagePaths[0] as string;
  const attachmentId = await readAttachmentId('thread-image');
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantReadImageAttachment, {
    attachmentId
  })).resolves.toEqual(expect.objectContaining({ contentBase64: CONTENT_BASE64, status: 'ready' }));

  await handleAssistantCommand(NATIVE_COMMANDS.assistantRemoveThreadFromHistory, {
    providerThreadId: 'thread-image'
  });
  await expect(fs.access(imagePath)).rejects.toThrow();
});

it('hydrates saved images when a tool upgrade continues in a new thread', async () => {
  adapterSendMessage
    .mockResolvedValueOnce(readyResult('thread-old', 'turn-old'))
    .mockResolvedValueOnce(readyResult('thread-new', 'turn-new'));
  await sendImage('thread-old');
  openAssistantHistoryConnection().driver.execute(
    'UPDATE assistant_thread_index SET agent_tool_version = 1 WHERE provider_thread_id = ?',
    ['thread-old']
  );

  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Continue now',
    openingLocation: { type: 'workspace' },
    providerThreadId: 'thread-old'
  });

  expect(adapterSendMessage.mock.lastCall?.[0]).toEqual(expect.objectContaining({
    continuationMessages: [
      expect.objectContaining({
        images: [expect.objectContaining({ contentBase64: CONTENT_BASE64, mimeType: 'image/png' })],
        role: 'user'
      }),
      expect.objectContaining({ role: 'assistant' })
    ]
  }));
});

async function sendImage(threadId: string) {
  return handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    images: [{
      contentBase64: CONTENT_BASE64,
      mimeType: 'image/png',
      originalName: 'sample.png',
      sizeBytes: 8
    }],
    message: 'Describe this image',
    openingLocation: { type: 'workspace' }
  }).then((result) => {
    expect(result).toMatchObject({ message: { threadId } });
    return result;
  });
}

async function readAttachmentId(threadId: string) {
  const messages = await handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadMessages, {
    providerThreadId: threadId
  }) as Array<{ images?: Array<{ id: string }>; role: string }>;
  const attachmentId = messages.find((message) => message.role === 'user')?.images?.[0]?.id;
  expect(attachmentId).toMatch(/^[a-f0-9]{64}$/u);
  return attachmentId;
}

function readyResult(threadId: string, turnId: string) {
  return {
    message: { text: 'It is a PNG', threadId, turnId },
    provider: 'codex-app-server',
    state: 'ready'
  };
}
