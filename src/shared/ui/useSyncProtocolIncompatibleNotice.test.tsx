import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { useSyncProtocolIncompatibleNotice } from './useSyncProtocolIncompatibleNotice';

it('does not reopen for background retries, but allows a new manual attempt', () => {
  const { result, rerender } = renderHook(({ incompatible }) =>
    useSyncProtocolIncompatibleNotice(incompatible), { initialProps: { incompatible: true } });
  expect(result.current.open).toBe(true);
  act(() => result.current.close());
  rerender({ incompatible: false });
  rerender({ incompatible: true });
  expect(result.current.open).toBe(false);

  act(() => result.current.retry());
  rerender({ incompatible: false });
  rerender({ incompatible: true });
  expect(result.current.open).toBe(true);
});
