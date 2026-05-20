import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { openExternalUrl } from '../../shared/platform/bridge';

import { useExternalLinkPanels } from './useExternalLinkPanels';

vi.mock('../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

beforeEach(() => {
  vi.mocked(openExternalUrl).mockClear();
});

it('keeps regular external links in the in-app panel stack', () => {
  const { result } = renderHook(() => useExternalLinkPanels());

  act(() => {
    result.current.handleOpenExternalLink({ href: 'https://example.com/docs' });
  });

  expect(result.current.linkPanels).toHaveLength(1);
  expect(result.current.linkPanels[0]?.currentUrl).toBe('https://example.com/docs');
  expect(openExternalUrl).not.toHaveBeenCalled();
});

it('opens browser-targeted external links through platform navigation', () => {
  const { result } = renderHook(() => useExternalLinkPanels());

  act(() => {
    result.current.handleOpenExternalLink({ href: 'https://example.com/docs', target: 'browser' });
  });

  expect(result.current.linkPanels).toHaveLength(0);
  expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/docs');
});
