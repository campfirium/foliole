// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { verifyVisibleIsolation } from './visible-native-isolation-proof.mjs';

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
    ...overrides
  };
}

function visible(overrides = {}) {
  return {
    appReady: { pid: 900, session: 'visible-session', stage: 'app_ready' },
    bridgeReady: { pid: 900, session: 'visible-session', stage: 'bridge_ready' },
    windowVisible: { pid: 900, session: 'visible-session', stage: 'window_visible' },
    ...overrides
  };
}

describe('visible native isolation proof', () => {
  it('accepts an isolated visible runtime with unchanged main database mtime', () => {
    expect(verifyVisibleIsolation({
      after: snapshot(),
      before: snapshot(),
      visible: visible()
    })).toEqual({
      humanPid: 501,
      mainDatabaseMtimeMs: 1000,
      visiblePid: 900,
      visibleSession: 'visible-session'
    });
  });

  it('accepts no human preview while still requiring visible state markers', () => {
    expect(verifyVisibleIsolation({
      after: snapshot({ ready: null }),
      before: snapshot({ ready: null }),
      visible: visible()
    }).humanPid).toBeNull();
  });

  it('rejects human preview marker changes when a human preview is running', () => {
    expect(() =>
      verifyVisibleIsolation({
        after: snapshot({ markers: { ...humanMarkers, '.windows-native-window-visible.json': 'changed' } }),
        before: snapshot(),
        visible: visible()
      })
    ).toThrow('human preview ready markers changed');
  });

  it('rejects pid reuse with a human preview', () => {
    expect(() =>
      verifyVisibleIsolation({
        after: snapshot(),
        before: snapshot(),
        visible: visible({ windowVisible: { pid: 501, session: 'visible-session', stage: 'window_visible' } })
      })
    ).toThrow('reused the human preview runtime pid');
  });

  it('rejects main database writes during the visible gate', () => {
    expect(() =>
      verifyVisibleIsolation({
        after: snapshot({ mainDatabaseMtimeMs: 2000 }),
        before: snapshot(),
        visible: visible()
      })
    ).toThrow('main database mtime changed');
  });
});
