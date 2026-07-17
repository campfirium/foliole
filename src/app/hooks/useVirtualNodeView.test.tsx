import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useVirtualNodeView } from './useVirtualNodeView';

it('restores a persisted virtual browse root independently from the active topic', () => {
  const setBrowseRootNode = vi.fn();
  const { rerender, result } = renderHook(
    (props: Parameters<typeof useVirtualNodeView>[0]) => useVirtualNodeView(props),
    {
      initialProps: {
        browseRootNodeId: 'special-home',
        browseRootSpecialKind: 'home' as const,
        setBrowseRootNode
      } as Parameters<typeof useVirtualNodeView>[0]
    }
  );

  expect(result.current.isVirtualViewOpen).toBe(false);

  rerender({
    browseRootNodeId: 'virtual-a',
    browseRootSpecialKind: 'virtual',
    setBrowseRootNode
  });

  expect(result.current.activeVirtualNodeId).toBe('virtual-a');
  expect(result.current.isVirtualViewOpen).toBe(true);
});

it('temporarily closes a virtual surface without discarding its browse root', () => {
  const setBrowseRootNode = vi.fn();
  const props = {
    browseRootNodeId: 'virtual-a',
    browseRootSpecialKind: 'virtual' as const,
    setBrowseRootNode
  };
  const { rerender, result } = renderHook(useVirtualNodeView, { initialProps: props });

  act(() => result.current.closeVirtualView());
  rerender(props);

  expect(result.current.activeVirtualNodeId).toBe('virtual-a');
  expect(result.current.isVirtualViewOpen).toBe(false);

  rerender({ ...props, browseRootNodeId: 'virtual-b' });

  expect(result.current.activeVirtualNodeId).toBe('virtual-b');
  expect(result.current.isVirtualViewOpen).toBe(true);
});
