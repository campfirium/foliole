// @vitest-environment node

import { expect, it } from 'vitest';

import { sanitizeDiagnosticText } from './codexAppServerTurnDiagnostics.js';

it('redacts URLs and credentials from Codex turn diagnostics', () => {
  expect(sanitizeDiagnosticText(
    'callback https://example.test/callback?code=secret Bearer abc token=def api_key ghi'
  )).toBe('callback [redacted-url] [redacted-credential] [redacted-credential] [redacted-credential]');
});
