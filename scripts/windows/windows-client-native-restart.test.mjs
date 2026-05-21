// @vitest-environment node

import { expect, it } from 'vitest';

import { isReadyAfterControlledRestart } from './windows-client-native-restart.mjs';

it('accepts a controlled runtime restart only after the session changes', () => {
  expect(isReadyAfterControlledRestart({
    appReady: {
      head: 'head-1',
      session: 'session-2'
    }
  }, {
    expectedHead: 'head-1',
    previousSession: 'session-1'
  })).toBe(true);

  expect(isReadyAfterControlledRestart({
    appReady: {
      head: 'head-1',
      session: 'session-1'
    }
  }, {
    expectedHead: 'head-1',
    previousSession: 'session-1'
  })).toBe(false);
});

it('requires the expected runtime head when one is provided', () => {
  expect(isReadyAfterControlledRestart({
    appReady: {
      head: 'old-head',
      session: 'session-2'
    }
  }, {
    expectedHead: 'new-head',
    previousSession: 'session-1'
  })).toBe(false);
});
