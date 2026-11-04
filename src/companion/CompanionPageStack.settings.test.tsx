import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { CompanionPageStack } from './CompanionPageStack';
import type { CompanionShellModel } from './CompanionShell';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

function SettingsNavigation() {
  const [page, setPage] = useState<CompanionSettingsPage>('storage');
  const model = { surface: { activeAction: 'more' }, settingsPage: page, floatingBar: {} } as CompanionShellModel;
  return <CompanionPageStack model={model} pageKey={null} reading={false} content={<>
    <h1>{page}</h1>
    <button onClick={() => setPage(page === 'storage' ? 'list' : 'foregroundTime')}>Back</button>
  </>} />;
}

it('opens the next settings page at its beginning after leaving a long Storage page', () => {
  render(<SettingsNavigation />);
  const storageViewport = screen.getByTestId('companion-scroll-container');
  storageViewport.scrollTop = 600;
  fireEvent.scroll(storageViewport);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'list' })).toBeVisible();
  expect(screen.getByTestId('companion-scroll-container').scrollTop).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'foregroundTime' })).toBeVisible();
  expect(screen.getByTestId('companion-scroll-container').scrollTop).toBe(0);
});
