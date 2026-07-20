import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true
  },
  registerPlugin: vi.fn(() => ({}))
}));

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { supportsCompanionExtendedSearch } from '../shared/platform/companionFullTextSearch';

import { CompanionSearchContent } from './CompanionSearchContent';

it('presents the complete shared local-search scope on iOS', () => {
  expect(supportsCompanionExtendedSearch()).toBe(true);

  renderWithLocalization(<CompanionSearchContent />);

  expect(screen.getByText('Topics and synced reading materials on this device.')).toBeInTheDocument();
  expect(screen.queryByText('Topics synced to this device.')).not.toBeInTheDocument();
});
