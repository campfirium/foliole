import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    on: vi.fn()
  }
}));

vi.mock('./database/externalOpenedDocuments.js', () => ({
  recordOpenedExternalDocument: vi.fn()
}));

vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: vi.fn()
}));

import { resolveExternalDocumentFileArgs } from './externalDocumentFileOpen.js';

it('extracts supported Markdown file paths from launch arguments', () => {
  expect(resolveExternalDocumentFileArgs([
    '/opt/Foliole/foliole.exe',
    '--original-process-start-time=123',
    '/Users/example/Inbox/read.md',
    '/Users/example/Inbox/skip.pdf',
    '/Users/example/Inbox/reference.markdown'
  ])).toEqual([
    '/Users/example/Inbox/read.md',
    '/Users/example/Inbox/reference.markdown'
  ]);
});
