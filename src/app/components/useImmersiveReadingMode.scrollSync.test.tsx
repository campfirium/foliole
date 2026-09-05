import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useImmersiveReadingMode } from './useImmersiveReadingMode';
import { buildImageScrollProps, buildProps, mountViewportHost } from './useImmersiveReadingMode.scrollSync.testSupport';

type ImmersiveProps = Parameters<typeof useImmersiveReadingMode>[0];

it('keeps the current scene when entering immersive reading by applying the pending selection', async () => {
  const { adapter, props, triggerScroll } = buildProps();
  const beginApplyingReadingPosition = vi.fn();
  const initialProps: ImmersiveProps = { ...props, beginApplyingReadingPosition, isImmersiveMode: false };
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  const { rerender } = renderHook(({ nextProps }) => useImmersiveReadingMode(nextProps), {
    initialProps: { nextProps: initialProps }
  });
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    triggerScroll();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
  });

  rerender({
    nextProps: {
      ...initialProps,
      isImmersiveMode: true
    }
  });

  await waitFor(() => {
    expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 7 });
  });
  expect(beginApplyingReadingPosition).toHaveBeenCalledWith({ from: 7, to: 7 }, 'enter-immersive');
  expect(adapter.setParagraphMarker).toHaveBeenCalledWith({ from: 7, to: 11 });
  expect(adapter.revealSelection).not.toHaveBeenCalled();
});

it('samples the viewport and starts applying when F11 enters immersive reading', () => {
  const { adapter, props } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  props.isImmersiveMode = false;
  const beginApplyingReadingPosition = vi.fn();
  props.beginApplyingReadingPosition = beginApplyingReadingPosition;
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
  });

  expect(props.onToggleImmersiveMode).toHaveBeenCalledTimes(1);
  expect(adapter.getPrimaryVisiblePosition).toHaveBeenCalledTimes(1);
  expect(props.getReadingPositionSelection()).toEqual({ from: 7, to: 7 });
  expect(beginApplyingReadingPosition).toHaveBeenCalledWith({ from: 7, to: 7 }, 'enter-immersive');
});

it('updates the reading position from manual scroll while immersive reading', () => {
  const { adapter, props, triggerScroll } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setParagraphMarker).mockClear();

  act(() => {
    triggerScroll();
  });

  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 7 });
  expect(adapter.setParagraphMarker).toHaveBeenCalledWith({ from: 7, to: 11 });
});
it('does not resubscribe immersive scroll sync when props rerender around the same editor', () => {
  const { adapter, props } = buildProps();
  mountViewportHost();
  const { rerender } = renderHook(({ nextProps }) => useImmersiveReadingMode(nextProps), {
    initialProps: { nextProps: props }
  });

  expect(adapter.onScroll).toHaveBeenCalledTimes(1);

  rerender({
    nextProps: {
      ...props,
      nodesById: {
        ...props.nodesById,
        'node-1': { ...props.nodesById['node-1']!, content: 'Updated body' }
      }
    }
  });

  expect(adapter.onScroll).toHaveBeenCalledTimes(1);
});

it('does not let a sampled viewport overwrite the target while an applying lock is active', () => {
  const { adapter, props, triggerScroll } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(14);
  props.setReadingPositionSelection({ from: 4296, to: 4296 });
  props.beginApplyingReadingPosition({ from: 4296, to: 4296 }, 'test-applying-lock');
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    triggerScroll();
  });

  expect(props.getReadingPositionSelection()).toEqual({ from: 4296, to: 4296 });
  expect(adapter.setSelection).not.toHaveBeenCalledWith({ from: 14, to: 14 });
});

it('ignores the immediate scroll event caused by paragraph navigation', () => {
  const { adapter, props, triggerScroll } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  vi.mocked(adapter.getDocumentPositionAtViewportY)
    .mockReturnValueOnce(2)
    .mockReturnValueOnce(7);
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(adapter.setSelection).toHaveBeenLastCalledWith({ from: 7, to: 7 });
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    triggerScroll();
  });

  expect(adapter.setSelection).not.toHaveBeenCalled();

  act(() => {
    triggerScroll();
  });

  expect(props.getReadingPositionSelection()).toEqual({ from: 7, to: 7 });
  expect(adapter.setSelection).not.toHaveBeenCalled();
});

it('ignores every programmatic scroll frame during smooth paragraph following', () => {
  const { adapter, props, triggerScroll } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(14);
  props.setReadingPositionSelection({ from: 7, to: 7 });
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    triggerScroll({ userInitiated: false });
    triggerScroll({ userInitiated: false });
    triggerScroll({ userInitiated: false });
  });

  expect(props.getReadingPositionSelection()).toEqual({ from: 7, to: 7 });
  expect(adapter.setSelection).not.toHaveBeenCalled();
});

it('ignores whitespace viewport samples while an image block is selected', () => {
  const { adapter, props, triggerScroll } = buildImageScrollProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(36);
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    triggerScroll();
  });

  expect(props.getReadingPositionSelection()).toBeNull();
  expect(adapter.setSelection).not.toHaveBeenCalled();
});

it('ignores image-adjacent viewport samples that drift outside the selected image block', () => {
  const { adapter, props, triggerScroll } = buildImageScrollProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(0);
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    triggerScroll();
  });

  expect(props.getReadingPositionSelection()).toBeNull();
  expect(adapter.setSelection).not.toHaveBeenCalled();
});
