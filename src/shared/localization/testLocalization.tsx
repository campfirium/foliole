import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

import { ExternalFoldersSettingsProvider } from '../../features/settings/context/ExternalFoldersSettingsProvider';

import { LocalizationProvider } from './LocalizationProvider';

export function renderWithLocalization(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => (
      <LocalizationProvider>
        <ExternalFoldersSettingsProvider>{children}</ExternalFoldersSettingsProvider>
      </LocalizationProvider>
    ),
    ...options
  });
}
