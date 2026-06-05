import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionBottomSheet } from './CompanionBottomSheet';

describe('CompanionBottomSheet', () => {
  it('keeps mobile sheets bounded and internally scrollable', () => {
    renderWithLocalization(
      <CompanionBottomSheet onOpenChange={vi.fn()} open title="Sheet">
        <div>Sheet body</div>
      </CompanionBottomSheet>
    );

    const dialog = screen.getByRole('dialog', { name: 'Sheet' });
    expect(dialog.className).toContain('max-h-[calc(100vh-2rem)]');
    expect(dialog.className).toContain('supports-[max-height:calc(100dvh-2rem)]:max-h-[calc(100dvh-2rem)]');
    expect(screen.getByText('Sheet body').parentElement?.className).toContain('overflow-y-auto');
  });
});
