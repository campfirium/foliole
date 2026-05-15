import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  IPC_DIAGNOSTIC_LOG_CHANNEL,
  IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL,
  IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL,
  IPC_INVOKE_CHANNEL,
  IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL,
  IPC_MENU_EVENT_CHANNEL,
  IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL,
  IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL,
  IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL,
  IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL,
  IPC_WINDOW_RESIZED_EVENT_CHANNEL,
  IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL
} from './contracts.js';

const PRELOAD_PATH = join(process.cwd(), 'electron/preload.cjs');

const BRIDGE_CHANNELS = {
  IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL,
  IPC_DIAGNOSTIC_LOG_CHANNEL,
  IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL,
  IPC_INVOKE_CHANNEL,
  IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL,
  IPC_MENU_EVENT_CHANNEL,
  IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL,
  IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL,
  IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL,
  IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL,
  IPC_WINDOW_RESIZED_EVENT_CHANNEL,
  IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL
} as const;

const SUBSCRIBABLE_CHANNEL_NAMES = [
  'IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL',
  'IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL',
  'IPC_MENU_EVENT_CHANNEL',
  'IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL',
  'IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL',
  'IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL',
  'IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL',
  'IPC_WINDOW_RESIZED_EVENT_CHANNEL',
  'IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL'
].sort();

function readPreloadSource() {
  return readFileSync(PRELOAD_PATH, 'utf8');
}

function collectPreloadChannelValues(source: string) {
  return [...source.matchAll(/^const (IPC_[A-Z_]+_CHANNEL) = '([^']+)';$/gm)].reduce<Record<string, string>>(
    (channels, match) => ({
      ...channels,
      [match[1] ?? '']: match[2] ?? ''
    }),
    {}
  );
}

describe('ipc contracts', () => {
  it('keeps bridge channel names aligned with preload', () => {
    const preloadChannels = collectPreloadChannelValues(readPreloadSource());

    expect(preloadChannels).toEqual(BRIDGE_CHANNELS);
  });

  it('keeps preload subscription allowlist aligned with renderer event channels', () => {
    const preloadSource = readPreloadSource();
    const allowlistNames = [...preloadSource.matchAll(/channel !== (IPC_[A-Z_]+_CHANNEL)/g)]
      .map((match) => match[1])
      .sort();

    expect(allowlistNames).toEqual(SUBSCRIBABLE_CHANNEL_NAMES);
  });
});
