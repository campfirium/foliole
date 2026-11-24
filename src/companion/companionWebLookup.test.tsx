import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';

import { CompanionSelectionMoreMenu } from './CompanionSelectionMoreMenu';
import { CompanionWebLookupSettingsContent } from './CompanionWebLookupSettingsContent';

let opened: string[] = [];

beforeEach(() => {
  window.localStorage.removeItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries);
  opened = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { opened.push(this.href); });
});
afterEach(() => { vi.restoreAllMocks(); });

function renderMenu(text: string, onOpened = vi.fn()) {
  render(<CompanionSelectionMoreMenu rect={new DOMRect(10, 10, 50, 20)} text={text} titleText="Walden"
    onCopied={() => {}} onOpenedLookup={onOpened} />);
  return onOpened;
}

it('lists the enabled web lookup entries and opens the resolved link', () => {
  const onOpened = renderMenu('ephemeral');
  expect(screen.queryByRole('menuitem', { name: 'Search with DuckDuckGo' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));
  expect(opened).toEqual([`https://chatgpt.com/?prompt=${encodeURIComponent('ephemeral（《Walden》）')}`]);
  expect(onOpened).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Search with Google' }));
  expect(opened[1]).toBe('https://www.google.com/search?q=ephemeral');
});

it('copies an overlong prompt and opens the target only after confirmation', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  renderMenu('x'.repeat(6000));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));
  const continueButton = await screen.findByRole('button', { name: 'Continue' });
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(opened).toEqual([]);
  fireEvent.click(continueButton);
  expect(opened).toEqual(['https://chatgpt.com/']);
});

it('lets the phone hide, add and edit its own lookup entries', () => {
  const { unmount } = render(<CompanionWebLookupSettingsContent />);
  fireEvent.click(screen.getByRole('switch', { name: 'Hide menu item: Search with Google' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add menu item' }));
  const label = screen.getByRole('textbox', { name: 'New menu item menu label' });
  fireEvent.change(label, { target: { value: 'Ask Claude' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'New menu item link' }), { target: { value: 'https://claude.ai/new' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'New menu item link' }), { target: { value: 'https://claude.ai/new?q={selection}' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  unmount();
  renderMenu('ephemeral');
  expect(screen.queryByRole('menuitem', { name: 'Search with Google' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ask Claude' }));
  expect(opened).toEqual(['https://claude.ai/new?q=ephemeral']);
});
