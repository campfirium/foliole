import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadingActionsSheet } from './CompanionReadingSheets';

describe('ReadingActionsSheet', () => {
  it('opens secondary reading sheets from the More actions sheet', () => {
    const onOpenChange = vi.fn();
    const onOpenReadingSheet = vi.fn();
    render(
      <ReadingActionsSheet
        onFindInDocument={vi.fn()}
        onOpenChange={onOpenChange}
        onOpenReadingSheet={onOpenReadingSheet}
        open
      />
    );

    expect(screen.getByRole('button', { name: 'Font' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Info' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenReadingSheet).toHaveBeenCalledWith('highlight');
  });
});
