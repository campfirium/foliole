import { BrowserWindow } from 'electron';

import { IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL } from './contracts.js';

interface ReadwiseProgressPayload {
  phase: 'fetching' | 'indexing' | 'merging' | 'source_completed' | 'writing';
  processedCount: number;
  sourceProcessedCount?: number;
  status: 'cancelled' | 'completed' | 'failed' | 'running';
  totalCount: number;
}

interface ReadwiseProgressWindow {
  isDestroyed: () => boolean;
  webContents: { send: (channel: string, payload: ReadwiseProgressPayload) => void };
}

export function notifyReadwiseReaderImportProgress(
  payload: ReadwiseProgressPayload,
  targetWindow?: ReadwiseProgressWindow | null
) {
  const windows: ReadwiseProgressWindow[] = targetWindow
    ? [targetWindow]
    : typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [];
  for (const window of windows) {
    if (window.isDestroyed()) continue;
    window.webContents.send(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, payload);
  }
}
