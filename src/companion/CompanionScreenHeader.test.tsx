import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CompanionScreenHeader } from './CompanionScreenHeader';

describe('CompanionScreenHeader', () => {
  it('uses the parent mobile rail without adding another horizontal inset', () => {
    const { container } = render(
      <CompanionScreenHeader
        metric="208 items"
        subtitle="Recent readable topics."
        title="Browse"
      />
    );

    expect(container.firstElementChild).not.toHaveClass('px-1');
    expect(screen.getByRole('heading', { name: 'Browse' })).toBeInTheDocument();
  });
});
