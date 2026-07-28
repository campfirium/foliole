import { render, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';

import packageJson from '../../../../package.json';
import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../../shared/localization/translations';

import { SettingsSidebar } from './SettingsSidebar';

const CURRENT_VERSION_LABEL = `v${packageJson.version}`;

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
  const scrollBody = nav.parentElement;
  const editor = screen.getByRole('button', { name: 'Editor' });
  const group = editor.closest('.relative');

  expect(scrollBody).toHaveClass('overflow-auto');
  expect(scrollBody?.className).toContain('--workspace-region-main-topic-scrollbar-thumb-color');
  expect(nav).toHaveClass('w-full');
  expect(nav).toHaveClass('items-stretch');
  expect(group).toHaveClass('before:left-3');
  expect(group).toHaveClass('before:right-3');
  expect(group).toHaveClass('w-full');
  expect(editor).toHaveClass('w-full');
});

it('labels the demo settings brand separately from the version when supplied', () => {
  render(
    <LocalizationProvider>
      <SettingsSidebar
        activeCategory="editor"
        brandBadge="Demo"
        setActiveCategory={vi.fn()}
      />
    </LocalizationProvider>
  );

  expect(screen.getByText('Foliole')).toBeInTheDocument();
  expect(screen.getByText('Demo')).toBeInTheDocument();
  expect(screen.getByText(CURRENT_VERSION_LABEL)).toBeInTheDocument();
});

it('groups workspace and control settings in product order', () => {
  render(
    <LocalizationProvider>
      <SettingsSidebar activeCategory="editor" setActiveCategory={vi.fn()} />
    </LocalizationProvider>
  );

  const groupLabels = screen.getAllByText(/^(Workspace|Controls|Data|Sources)$/).map((node) => node.textContent);
  expect(groupLabels).toEqual(['Workspace', 'Controls', 'Data', 'Sources']);
  expect(screen.getByLabelText('Settings navigation').firstElementChild).toHaveTextContent('About');

  const controls = screen.getByText('Controls').closest('.relative');
  expect(controls).not.toBeNull();
  expect(controls?.querySelectorAll('button')).toHaveLength(5);
  expect(Array.from(controls?.querySelectorAll('button') ?? []).map((button) => button.textContent)).toEqual([
    'Hotkeys',
    'Left toolbar',
    'Topic menu',
    'Mouse gestures',
    'Right-click menu'
  ]);

  const workspace = screen.getByText('Workspace').closest('.relative');
  expect(Array.from(workspace?.querySelectorAll('button') ?? []).map((button) => button.textContent)).toEqual([
    'General',
    'Appearance',
    'Typography',
    'Editor',
    'Review',
    'Publish'
  ]);
});
