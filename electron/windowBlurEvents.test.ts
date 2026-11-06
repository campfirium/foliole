// @vitest-environment node
import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import { bindWindowBlurEvents } from './windowBlurEvents.js';

it('publishes native loss to its own renderer without changing Chromium focus and removes the listener on close', () => {
  const window = Object.assign(new EventEmitter(), { webContents: { isDestroyed: () => false, send: vi.fn() } });
  bindWindowBlurEvents(window as never);
  window.emit('blur', { sender: 'private native event' });
  expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith('foliole:window-blur');
  window.emit('closed');
  window.emit('blur');
  expect(window.webContents.send).toHaveBeenCalledTimes(1);
});
