import { expect, it, vi } from 'vitest';

import { showAppRuntimeNotice } from './AppRuntimeNotice';
import { listenForBodyOverflow, requestBodyOverflow } from './bodyOverflowRequest';

vi.mock('./AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));
const request = () => ({ nodeId: 'topic', previousContent: 'original', content: 'candidate', prepare: vi.fn(), cancel: vi.fn() });
it('shows the text limit notice if this surface has no body split handler', () => {
  vi.mocked(showAppRuntimeNotice).mockClear();
  const candidate = request();
  requestBodyOverflow(candidate);
  expect(showAppRuntimeNotice).toHaveBeenCalledOnce();
  expect(candidate.prepare).not.toHaveBeenCalled();
});
it('leaves a handled ordinary body overflow with its existing split flow', () => {
  vi.mocked(showAppRuntimeNotice).mockClear();
  const listener = vi.fn();
  const unsubscribe = listenForBodyOverflow(listener);
  try {
    const candidate = request();
    requestBodyOverflow(candidate);
    expect(listener).toHaveBeenCalledWith(candidate);
    expect(showAppRuntimeNotice).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});
