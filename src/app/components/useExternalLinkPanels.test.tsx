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

it('does not create link panels for non-web protocols', () => {
  const { result } = renderHook(() => useExternalLinkPanels());

  act(() => {
    result.current.handleOpenExternalLink({ href: 'mailto:reader@example.com' });
  });

  expect(result.current.linkPanels).toHaveLength(0);
  expect(openExternalUrl).toHaveBeenCalledWith('mailto:reader@example.com');
});

it('ignores non-web navigation updates from an existing link panel', () => {
  const { result } = renderHook(() => useExternalLinkPanels());

  act(() => {
    result.current.handleOpenExternalLink({ href: 'https://example.com/docs' });
  });
  const panelId = result.current.linkPanels[0]?.id as string;

  act(() => {
    result.current.handleLinkPanelStateChange(panelId, {
      canGoBack: true,
      currentUrl: 'file:///tmp/secret.txt',
      title: 'Local file'
    });
  });

  expect(result.current.linkPanels[0]).toMatchObject({
    canGoBack: false,
    currentUrl: 'https://example.com/docs'
  });
});
