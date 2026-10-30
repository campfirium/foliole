import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LocalizationProvider } from './LocalizationProvider';

it('keeps translated consumers connected across provider module versions', async () => {
  const modulePath = './LocalizationProvider.tsx?refresh-generation=next';
  const refreshed = await import(modulePath) as typeof import('./LocalizationProvider');
  function RefreshedConsumer() {
    const { locale } = refreshed.useLocalization();
    return <p>{locale}</p>;
  }
  render(<LocalizationProvider initialLanguagePreference="en"><RefreshedConsumer /></LocalizationProvider>);
  expect(screen.getByText('en')).toBeInTheDocument();
});
