import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useDismissibleSurface } from './useDismissibleSurface';

function pressEscape() {
  const event = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
  window.dispatchEvent(event);
  return event;
}

it('dismisses an enabled surface on Escape', () => {
  const onDismiss = vi.fn();
  renderHook(() => useDismissibleSurface({ onDismiss }));

  const event = pressEscape();

  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
});

it('does not dismiss or consume Escape while disabled', () => {
  const onDismiss = vi.fn();
  renderHook(() => useDismissibleSurface({ enabled: false, onDismiss }));

  const event = pressEscape();

  expect(onDismiss).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});

it('does not dismiss or consume Escape when shouldDismiss blocks dismissal', () => {
  const onDismiss = vi.fn();
  renderHook(() => useDismissibleSurface({ onDismiss, shouldDismiss: () => false }));

  const event = pressEscape();

  expect(onDismiss).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});

it('removes the Escape listener after unmount', () => {
  const onDismiss = vi.fn();
  const { unmount } = renderHook(() => useDismissibleSurface({ onDismiss }));

  unmount();
  const event = pressEscape();

  expect(onDismiss).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});
