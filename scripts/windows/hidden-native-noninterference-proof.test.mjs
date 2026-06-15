// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { verifyNonInterference } from './hidden-native-noninterference-proof.mjs';

const humanReady = {
  appReady: { pid: 501, session: 'human-session', stage: 'app_ready' },
  bridgeReady: { pid: 501, session: 'human-session', stage: 'bridge_ready' },
  windowVisible: { pid: 501, session: 'human-session', stage: 'window_visible' }
};

const humanMarkers = {
  '.windows-native-boot-ready.json': 'human-app',
  '.windows-native-bridge-ready.json': 'human-bridge',
  '.windows-native-window-visible.json': 'human-window'
};

function snapshot(overrides = {}) {
  return {
    mainDatabaseMtimeMs: 1000,
    markers: humanMarkers,
    ready: humanReady,
    state: { runtimePid: 501 },
    ...overrides
  };
}

function hidden(overrides = {}) {
  return {
    appReady: { pid: 900, session: 'hidden-session', stage: 'app_ready' },
    bridgeReady: { pid: 900, session: 'hidden-session', stage: 'bridge_ready' },
    markers: {},
    windowVisible: { pid: 900, session: 'hidden-session', stage: 'window_visible' },
    ...overrides
  };
}

describe('hidden native noninterference proof', () => {
  it('accepts stable human markers and a distinct hidden runtime pid', () => {
    expect(verifyNonInterference({
      after: snapshot(),
      before: snapshot(),
      hidden: hidden()
    })).toEqual({
      hiddenPid: 900,
      hiddenSession: 'hidden-session',
      humanPid: 501,
      mainDatabaseMtimeMs: 1000,
      humanSession: 'human-session'
    });
  });

  it('rejects human preview marker changes', () => {
    expect(() =>
      verifyNonInterference({
        after: snapshot({ markers: { ...humanMarkers, '.windows-native-window-visible.json': 'changed' } }),
        before: snapshot(),
        hidden: hidden()
      })
    ).toThrow('human preview ready markers changed');
  });

  it('rejects pid reuse between hidden gate and human preview', () => {
    expect(() =>
      verifyNonInterference({
        after: snapshot(),
        before: snapshot(),
        hidden: hidden({ windowVisible: { pid: 501, session: 'hidden-session', stage: 'window_visible' } })
      })
    ).toThrow('reused the human preview runtime pid');
  });

  it('rejects main database writes during the hidden gate', () => {
    expect(() =>
      verifyNonInterference({
        after: snapshot({ mainDatabaseMtimeMs: 2000 }),
        before: snapshot(),
        hidden: hidden()
      })
    ).toThrow('main database mtime changed');
  });
});
