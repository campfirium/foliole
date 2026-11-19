import path from 'node:path';

import { app, shell } from 'electron';

import { readSupportRecordingEntry } from '../../lib/platform/supportRecordingEntry.js';

import { copyDiagnosticReport, formatRecord } from './diagnosticBundle.js';
import { SupportLogFiles } from './supportLogFiles.js';

const files = new SupportLogFiles(() => path.join(app.getPath('userData'), 'logs', 'support-recordings'));

export async function runDesktopSupportLogAction(action: unknown, startedAt?: unknown, input?: unknown) {
  switch (action) {
    case 'record': {
      const entry = readSupportRecordingEntry(input);
      if (entry && files.recording && typeof startedAt === 'number' && Number.isSafeInteger(startedAt)) {
        await files.append(() => JSON.stringify({ at: new Date().toISOString(), ...entry }), startedAt);
      }
      return files.status();
    }
    case 'status': return files.status();
    case 'start': return files.start(async () => (await copyDiagnosticReport({ app })).report_text);
    case 'stop': return files.stop();
    case 'reveal': return files.reveal(filePath => shell.showItemInFolder(filePath));
    default: throw new Error('Invalid support log action');
  }
}

export async function recordDesktopSupportEvent(record: Parameters<typeof formatRecord>[0]) {
  if (files.recording) {
    await files.append(() => JSON.stringify({ level: record.level, ...formatRecord(record) }));
  }
}

export function recordDesktopReadingProgressSummary(
  event: 'reading-progress.db-save' | 'reading-progress.db-load',
  summarize: () => { hasActiveDocument: boolean; positions: number; hasActivePosition: boolean }
) {
  if (!files.recording) return;
  void files.append(() => JSON.stringify({ event, at: new Date().toISOString(), ...summarize() })).catch(() => undefined);
}
