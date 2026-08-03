import { expect, it } from 'vitest';

import { classifyDesktopUpdateFailure, desktopUpdateDiagnosticLabel } from './desktopUpdateErrorPolicy.js';

it('separates structural integrity failures from retryable transport failures', () => {
  expect(classifyDesktopUpdateFailure(new Error('sha512 checksum mismatch'))).toBe('structural');
  expect(classifyDesktopUpdateFailure(new Error('net::ERR_CONNECTION_RESET'))).toBe('transient');
  expect(classifyDesktopUpdateFailure(new Error('HTTP 404 while assets propagate'))).toBe('transient');
  expect(classifyDesktopUpdateFailure(Object.assign(new Error('latest-mac.yml missing'), {
    code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
  }))).toBe('structural');
  expect(desktopUpdateDiagnosticLabel('download', 'retry-exhausted')).toBe(
    'desktop_update_download_retry_exhausted'
  );
});
