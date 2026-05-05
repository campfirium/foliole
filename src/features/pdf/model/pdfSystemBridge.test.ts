import { afterEach, expect, it, vi } from 'vitest';

import { registerPdfSystem, requestPdfAnchorJump, unregisterPdfSystem } from './pdfSystemBridge';

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
    requestAnchorJump
  });

  expect(requestPdfAnchorJump(NODE_ID, { page: 5, x: 0.1, y: 0.7 })).toBe(true);
  expect(requestAnchorJump).toHaveBeenCalledWith({ page: 5, x: 0.1, y: 0.7 });
});

it('stops forwarding after unregistering active pdf system', () => {
  const requestAnchorJump = vi.fn();
  registerPdfSystem(NODE_ID, {
    requestAnchorJump
  });
  unregisterPdfSystem(NODE_ID);

  expect(requestPdfAnchorJump(NODE_ID, { page: 3, x: 0.2, y: 0.5 })).toBe(false);
  expect(requestAnchorJump).not.toHaveBeenCalled();
});
