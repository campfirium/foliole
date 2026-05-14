import { afterEach, expect, it, vi } from 'vitest';

import {
  registerPdfSystem,
  requestPdfAnchorJump,
  requestPdfSearch,
  resetPdfSystemRegistryForTest,
  unregisterPdfSystem
} from './pdfSystemRegistry';

const NODE_ID = 'pdf-node-1';

afterEach(() => {
  resetPdfSystemRegistryForTest();
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

it('bounds queued anchor jumps by the oldest node id', () => {
  const requestAnchorJump = vi.fn();

  for (let index = 0; index < 129; index += 1) {
    expect(requestPdfAnchorJump(`pdf-node-${index}`, { page: index + 1, x: 0.1, y: 0.2 })).toBe(false);
  }

  registerPdfSystem('pdf-node-0', {
    requestAnchorJump,
    requestSearch: vi.fn()
  });
  expect(requestAnchorJump).not.toHaveBeenCalled();

  registerPdfSystem('pdf-node-1', {
    requestAnchorJump,
    requestSearch: vi.fn()
  });
  expect(requestAnchorJump).toHaveBeenCalledWith({ page: 2, x: 0.1, y: 0.2 });
});

it('bounds queued search requests by the oldest node id', () => {
  const requestSearch = vi.fn();

  for (let index = 0; index < 129; index += 1) {
    expect(requestPdfSearch(`pdf-node-${index}`, { query: `q${index}`, page: index + 1, matchStart: 1 })).toBe(false);
  }

  registerPdfSystem('pdf-node-0', {
    requestAnchorJump: vi.fn(),
    requestSearch
  });
  expect(requestSearch).not.toHaveBeenCalled();

  registerPdfSystem('pdf-node-1', {
    requestAnchorJump: vi.fn(),
    requestSearch
  });
  expect(requestSearch).toHaveBeenCalledWith({ query: 'q1', page: 2, matchStart: 1 });
});
