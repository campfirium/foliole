import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionReadingSystemFonts } from './CompanionReadingSystemFonts';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';

vi.mock('@/features/settings/model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn(async () => ({ fonts: ['Roboto', 'Noto Sans SC'], monospaceFonts: [] }))
}));

it('offers available device fonts and applies the selected family', async () => {
  const onChange = vi.fn();
  render(<CompanionReadingSystemFonts onChange={onChange} settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />);
  const picker = await screen.findByRole('combobox', { name: 'Device fonts' });
  fireEvent.change(picker, { target: { value: 'Noto Sans SC' } });
  expect(onChange).toHaveBeenCalledWith({
    ...DEFAULT_READING_TYPOGRAPHY_SETTINGS,
    fontFamily: 'system:Noto Sans SC'
  });
});
