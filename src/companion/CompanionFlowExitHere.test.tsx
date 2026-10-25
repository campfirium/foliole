import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { FlowExitHereContext } from '../shared/ui/FlowExitHereContext';

import { ReadingActionsSheet } from './CompanionReadingSheets';

it('offers exit in place in Flow and closes the mobile menu before leaving', () => {
  const close = vi.fn();
  const exit = vi.fn();
  renderWithLocalization(<FlowExitHereContext.Provider value={exit}>
    <ReadingActionsSheet open onFindInDocument={vi.fn()} onOpenChange={close} onOpenReadingSheet={vi.fn()} />
  </FlowExitHereContext.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Exit Flow' }));
  expect(close).toHaveBeenCalledWith(false);
  expect(exit).toHaveBeenCalledOnce();
});

it('does not offer a Flow exit in ordinary reading', () => {
  renderWithLocalization(<ReadingActionsSheet open onFindInDocument={vi.fn()} onOpenChange={vi.fn()} onOpenReadingSheet={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Exit Flow' })).not.toBeInTheDocument();
});
