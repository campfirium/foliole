import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSearchPdfLoadingState } from './CompanionSearchPdfDocument';

describe('CompanionSearchPdfLoadingState', () => {
  it('keeps a return path while the PDF viewer chunk is loading', () => {
    const onExit = vi.fn();
    renderWithLocalization(<CompanionSearchPdfLoadingState onExit={onExit} />);

    expect(screen.getByText('Preparing PDF')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
