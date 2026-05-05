// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  classifyInstallerClearAppDataEvents,
  parseInstallerClearAppDataEvent
} from './android-install-events.mjs';

describe('android install event classification', () => {
  it('treats installer flags 39 as a code-cache clear instead of app data loss', () => {
    const event = parseInstallerClearAppDataEvent(
      '05-03 10:11:12.000  1000  1000 I installer_clear_app_data_caller: [710,1000,com.foliole.android,39]'
    );

    expect(event).toMatchObject({
      codeCacheOnly: true,
      flags: 39,
      potentialDataClear: false
    });
  });

  it('keeps unknown installer clear events in the potential data-clear bucket', () => {
    const events = classifyInstallerClearAppDataEvents([
      'I installer_clear_app_data_caller: [710,1000,com.foliole.android,39]',
      'I installer_clear_app_data_caller: [710,1000,com.foliole.android,7]',
      'I am_kill: [0,com.foliole.android]'
    ]);

    expect(events.codeCacheOnly).toHaveLength(1);
    expect(events.potentialDataClear).toHaveLength(1);
    expect(events.potentialDataClear[0]).toMatchObject({ flags: 7 });
  });
});
