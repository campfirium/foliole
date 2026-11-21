import { expect, it } from 'vitest';

import { redactDiagnosticPayload } from './diagnosticRedactor.js';

it('redacts sensitive diagnostic fields while preserving support context', () => {
  expect(redactDiagnosticPayload({
    action: 'open_external_url',
    absolutePath: '/Users/alice/private/book.md',
    bodyTextSample: 'Private note body',
    message: 'Failed to read /Users/alice/private/book.md token=abc Authorization: Bearer private-key',
    nested: {
      signature: 'abcdef',
      status: 'failed'
    },
    token: 'secret-token',
    url: 'https://example.test/secret?token=abc'
  })).toEqual({
    action: 'open_external_url',
    absolutePath: '[redacted-path]',
    bodyTextSample: '[redacted-body-sample]',
    message: 'Failed to read [redacted-path] token=[redacted-secret] Authorization=[redacted-secret]',
    nested: {
      signature: '[redacted-secret]',
      status: 'failed'
    },
    token: '[redacted-secret]',
    url: '[redacted-url]'
  });
});

it('redacts external-volume and quoted paths including spaces in file names', () => {
  expect(redactDiagnosticPayload({
    message: "EPERM: operation not permitted, open '/Volumes/Books/某本 书.epub'",
    stderr_tail: 'at readFile (/private/var/folders/x/foliole-epub-1/source.epub)'
  })).toEqual({
    message: "EPERM: operation not permitted, open '[redacted-path]'",
    stderr_tail: 'at readFile ([redacted-path])'
  });
});
