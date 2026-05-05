import { afterEach, expect, it, vi } from 'vitest';

import { registerPdfSystem, requestPdfAnchorJump, requestPdfSearch, unregisterPdfSystem } from './pdfSystemRegistry';

const NODE_ID = 'pdf-node-1';

afterEach(() => {
  unregisterPdfSystem(NODE_ID);
});

it('returns false when requesting pdf anchor jump without an active pdf system', () => {
  expect(requestPdfAnchorJump(NODE_ID, { page: 2, x: 0.3, y: 0.4 })).toBe(false);
});

it('forwards anchor jump request to active pdf system', () => {
  const requestAnchorJump = vi.fn();
  registerPdfSystem(NODE_ID, {
    requestAnchorJump,
    requestSearch: vi.fn()
  });

  expect(requestPdfAnchorJump(NODE_ID, { page: 5, x: 0.1, y: 0.7 })).toBe(true);
  expect(requestAnchorJump).toHaveBeenCalledWith({ page: 5, x: 0.1, y: 0.7 });
});

it('stops forwarding after unregistering active pdf system', () => {
  const requestAnchorJump = vi.fn();
  registerPdfSystem(NODE_ID, {
    requestAnchorJump,
    requestSearch: vi.fn()
  });
  unregisterPdfSystem(NODE_ID);

  expect(requestPdfAnchorJump(NODE_ID, { page: 3, x: 0.2, y: 0.5 })).toBe(false);
  expect(requestAnchorJump).not.toHaveBeenCalled();
});

it('replays the latest queued jump when registration happens after request', () => {
  const requestAnchorJump = vi.fn();

  expect(requestPdfAnchorJump(NODE_ID, { page: 2, x: 0.1, y: 0.2 })).toBe(false);
  expect(requestPdfAnchorJump(NODE_ID, { page: 6, x: 0.5, y: 0.8 })).toBe(false);

  registerPdfSystem(NODE_ID, {
    requestAnchorJump,
    requestSearch: vi.fn()
  });

  expect(requestAnchorJump).toHaveBeenCalledTimes(1);
  expect(requestAnchorJump).toHaveBeenCalledWith({ page: 6, x: 0.5, y: 0.8 });
});

it('queues and replays external pdf search request', () => {
  const requestSearch = vi.fn();

  expect(requestPdfSearch(NODE_ID, { query: 'atlas', page: 4, matchStart: 32 })).toBe(false);

  registerPdfSystem(NODE_ID, {
    requestAnchorJump: vi.fn(),
    requestSearch
  });

  expect(requestSearch).toHaveBeenCalledWith({ query: 'atlas', page: 4, matchStart: 32 });
});
