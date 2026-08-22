import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { setSystemEntryDisplayNames } from '../shared/localization/systemEntryDisplayNamesStore';

import { CompanionDirectoryList } from './CompanionDirectoryListSurface';

afterEach(() => {
  cleanup();
  setSystemEntryDisplayNames({ customDisplayNameById: {}, version: 1 });
});

it('uses the shared custom Home name instead of a fixed Workspace section', () => {
  setSystemEntryDisplayNames({ customDisplayNameById: { home: '我的 Home' }, version: 1 });
  render(
    <LocalizationProvider initialLanguagePreference="zh-Hans">
      <CompanionDirectoryList
        directory={{} as never}
        emptyLabel=""
        onSelectItem={vi.fn()}
        sections={[{ id: 'home', items: [] }]}
        snapshot={null}
      />
    </LocalizationProvider>
  );

  expect(screen.getByRole('heading', { name: '我的 Home' })).toBeInTheDocument();
  expect(screen.queryByText('工作区')).not.toBeInTheDocument();
});
