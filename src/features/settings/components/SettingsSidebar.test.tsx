import { render, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../../shared/localization/translations';

import { SettingsSidebar } from './SettingsSidebar';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

it('keeps category groups and rows stretched across the sidebar', () => {
  render(
    <LocalizationProvider>
      <SettingsSidebar
        activeCategory="editor"
        setActiveCategory={vi.fn()}
      />
    </LocalizationProvider>
  );

  const nav = screen.getByLabelText('Settings navigation');
  const editor = screen.getByRole('button', { name: 'Editor' });
  const group = editor.closest('.relative');

  expect(nav).toHaveClass('w-full');
  expect(nav).toHaveClass('items-stretch');
  expect(group).toHaveClass('w-full');
  expect(editor).toHaveClass('w-full');
});
