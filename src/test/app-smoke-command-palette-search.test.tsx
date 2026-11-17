import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { APP_LANGUAGE_STORAGE_KEY } from '../shared/localization/appLanguage';
import { preloadTranslationCatalog } from '../shared/localization/translations';

vi.doUnmock('../app/components/WorkspaceSettingsOverlay');

const { App } = await import('../app/App');

it('opens and highlights a setting selected from the command palette', async () => {
  const scrollIntoView = vi.fn();
  const previousScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;

  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Command Palette' }));
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    const input = within(palette).getByLabelText('Search commands');
    expect(within(palette).queryByRole('button', { name: /App language/ })).toBeNull();

    fireEvent.change(input, { target: { value: 'interface text' } });
    expect(within(palette).getByText('Choose the language used by Foliole interface text.')).toBeInTheDocument();
    expect(within(palette).getByRole('button', { name: 'App language' })).toBeInTheDocument();
    expect(within(palette).queryByRole('button', { name: /Configure shortcut for App language/ })).toBeNull();
    expect(within(palette).getByRole('button', { name: 'App language' }).parentElement)
      .toHaveAttribute('data-active', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    await waitFor(() => expect(document.querySelector('[data-settings-search-row-id="general-language"]'))
      .toHaveClass('bg-[rgb(var(--role-accent-rgb)_/_0.12)]'), { timeout: 5_000 });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  } finally {
    HTMLElement.prototype.scrollIntoView = previousScrollIntoView;
  }
});

it('orders commands, settings, and tips and shows both parts of a tip immediately', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Command Palette' }));
  const palette = await screen.findByRole('dialog', { name: 'Command palette' });
  const input = within(palette).getByLabelText('Search commands');
  expect(within(palette).queryByText('Action tips')).toBeNull();

  fireEvent.change(input, { target: { value: 'review' } });
  const command = within(palette).getByRole('button', { name: /^open review statistics$/i });
  const settings = within(palette).getByRole('button', { name: 'Review' });
  const tipsHeading = within(palette).getByText('Action tips');
  expect(command.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(settings.compareDocumentPosition(tipsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  fireEvent.change(input, { target: { value: 'You could not recall' } });
  expect(within(palette).getByText('Again', { exact: true })).toBeInTheDocument();
  expect(within(palette).getByText('Show this item again soon. You could not recall the answer.')).toBeInTheDocument();
  expect(within(palette).queryByText('Flow Ribbon')).toBeNull();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveFocus();
});

it('finds commands, settings, and tips by English and displays their Chinese copy', async () => {
  await preloadTranslationCatalog('zh-Hans');
  localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '命令面板' }));
  const palette = await screen.findByRole('dialog', { name: '命令面板' });
  const input = within(palette).getByLabelText('搜索命令');
  const search = (value: string) => fireEvent.change(input, { target: { value } });

  search('review statistics');
  expect(within(palette).getByRole('button', { name: '打开复习统计' })).toBeInTheDocument();

  search('interface text');
  expect(within(palette).getByText('选择 Foliole 界面文字使用的语言。')).toBeInTheDocument();

  for (const query of ['Relearn', 'renaissance', '重新学习', '清除此主题的学习进度']) {
    search(query);
    expect(within(palette).getByText('重新学习')).toBeInTheDocument();
    expect(within(palette).getByText('清除此主题的学习进度。之后可以从头再次学习。不影响派生材料。')).toBeInTheDocument();
  }
});
