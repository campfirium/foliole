import path from 'node:path';

import { app, shell } from 'electron';

import { copyDiagnosticReport, formatRecord } from './diagnosticBundle.js';
import { SupportLogFiles } from './supportLogFiles.js';

const files = new SupportLogFiles(() => path.join(app.getPath('userData'), 'logs', 'support-recordings'));

export function runDesktopSupportLogAction(action: unknown) {
  switch (action) {
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
