import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

import { LocalizationProvider } from './LocalizationProvider';

export function renderWithLocalization(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: LocalizationProvider, ...options });
}
