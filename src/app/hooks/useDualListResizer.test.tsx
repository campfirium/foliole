import { fireEvent, render, screen } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import { DUAL_LIST_WIDTH_DEFAULT, useDualListResizer } from './useDualListResizer';

function Harness() {
  const { handleKeyDown, width } = useDualListResizer();

  return (
    <>
      <div data-testid="dual-list-width">{width}</div>
      <div
        aria-label="Resize folder list"
        onKeyDown={(event) => handleKeyDown(event as KeyboardEvent<HTMLDivElement>)}
        role="separator"
        tabIndex={0}
      />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
});

it('loads the persisted folder list width on startup', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.dualListWidth, '222');

  render(<Harness />);

  expect(screen.getByTestId('dual-list-width').textContent).toBe('222');
});

it('uses the default folder list width when there is no saved preference', () => {
  render(<Harness />);

  expect(screen.getByTestId('dual-list-width').textContent).toBe(String(DUAL_LIST_WIDTH_DEFAULT));
});

it('persists folder list width updates from keyboard resize', () => {
  render(<Harness />);

  fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize folder list' }), { key: 'ArrowRight' });

  expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.dualListWidth)).toBe(String(DUAL_LIST_WIDTH_DEFAULT + 16));
  expect(screen.getByTestId('dual-list-width').textContent).toBe(String(DUAL_LIST_WIDTH_DEFAULT + 16));
});
