import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';

it('keeps UI smoke mounts independent from release network requests', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status: 503
  } as Response);

  try {
    const firstMount = render(<App />);
    firstMount.unmount();
    const secondMount = render(<App />);
    secondMount.unmount();

    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
