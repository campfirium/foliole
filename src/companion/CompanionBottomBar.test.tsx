import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionBottomBar } from './CompanionBottomBar';
import { CompanionReviewActionFooter } from './CompanionReviewActionFooter';

it('keeps bottom navigation on the page background instead of an elevated surface', () => {
  renderWithLocalization(<CompanionBottomBar>Navigation</CompanionBottomBar>);

  expect(screen.getByRole('contentinfo')).toHaveClass('bg-companion-base');
  expect(screen.getByRole('contentinfo')).not.toHaveClass('bg-companion-content');
});

it.each(['Show answer', 'Again · Hard · Good · Easy'])(
  'keeps the %s footer on the same page background', (action) => {
    renderWithLocalization(<CompanionReviewActionFooter primary={<button>{action}</button>} />);

    expect(screen.getByRole('button', { name: action })).toBeVisible();
    expect(screen.getByRole('contentinfo')).toHaveClass('bg-companion-base');
    expect(screen.getByRole('contentinfo')).not.toHaveClass('bg-companion-content');
  }
);
