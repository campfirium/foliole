import { expect, it } from 'vitest';

import { redactExportedDiagnosticText } from './diagnosticExportRedactor.js';

it('keeps error codes and fixed wording while removing paths, file names and quoted titles', () => {
  expect(redactExportedDiagnosticText("EPERM: operation not permitted, open '/Users/alice/Downloads/某本书.epub'"))
    .toBe("EPERM: operation not permitted, open '[redacted-path]'");
  expect(redactExportedDiagnosticText('ENOENT: no such file, open /Volumes/U盘/Books/Private Title.epub'))
    .toBe('ENOENT: no such file, open [redacted-path] [file].epub');
  expect(redactExportedDiagnosticText('Cannot read ~/Library/Mobile Documents/x.pdf'))
    .toBe('Cannot read [redacted-path] Documents/[file].pdf');
  expect(redactExportedDiagnosticText('EPUB import failed: missing chapter 三体.xhtml in 某本书.epub'))
    .toBe('EPUB import failed: missing chapter [file].xhtml in [file].epub');
  expect(redactExportedDiagnosticText('Node "我的私人笔记" not found in 《三体》 and 「第一章」'))
    .toBe('Node "[redacted-text]" not found in 《[redacted-text]》 and 「[redacted-text]」');
  expect(redactExportedDiagnosticText("can't open 'Secret Title' because it doesn't exist"))
    .toBe("can't open '[redacted-text]' because it doesn't exist");
});

it('keeps ordinary identifiers that only look like file names', () => {
  expect(redactExportedDiagnosticText('TypeError: Cannot read properties of undefined (reading electron.main) in v0.8.2'))
    .toBe('TypeError: Cannot read properties of undefined (reading electron.main) in v0.8.2');
  expect(redactExportedDiagnosticText('EPUB import failed: unsupported ZIP compression method 12'))
    .toBe('EPUB import failed: unsupported ZIP compression method 12');
});

it('caps exported error text length', () => {
  const text = redactExportedDiagnosticText(`Error ${'x'.repeat(500)}`);
  expect(text.length).toBe(201);
  expect(text.endsWith('…')).toBe(true);
});
