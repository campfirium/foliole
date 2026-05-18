import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { getEnabledWebLookupEntries } from '../../../../shared/platform/webLookupEntries';

import { SettingsWebLookupSection } from './SettingsWebLookupSection';

beforeEach(() => {
  window.localStorage.clear();
});

it('shows built-in right-click menu items with DuckDuckGo disabled by default', () => {
  render(<SettingsWebLookupSection />);

  expect(screen.getByRole('heading', { name: 'Right-click menu items' })).toBeInTheDocument();
  expect(screen.getByDisplayValue('ChatGPT')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Google')).toBeInTheDocument();
  expect(screen.getByDisplayValue('DuckDuckGo')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Show DuckDuckGo in context menu' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'ChatGPT link' }).value).toContain('{selection}');
});

it('toggles whether an entry appears in the context menu', () => {
  render(<SettingsWebLookupSection />);

  fireEvent.click(screen.getByRole('switch', { name: 'Show DuckDuckGo in context menu' }));

  expect(getEnabledWebLookupEntries().map((entry) => entry.id)).toEqual([
    'chatgpt',
    'google',
    'duckduckgo'
  ]);
  expect(screen.getByRole('switch', { name: 'Hide DuckDuckGo in context menu' })).toHaveAttribute('aria-checked', 'true');
});

it('updates the ChatGPT menu name and link', () => {
  render(<SettingsWebLookupSection />);

  fireEvent.change(screen.getByRole('textbox', { name: 'ChatGPT menu item name' }), {
    target: { value: 'Summarize' }
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Summarize link' }), {
    target: { value: 'https://chatgpt.com/?prompt=Summarize:%0A{selection}' }
  });

  const chatgpt = getEnabledWebLookupEntries().find((entry) => entry.id === 'chatgpt');
  expect(chatgpt?.label).toBe('Summarize');
  expect(chatgpt?.urlTemplate).toBe('https://chatgpt.com/?prompt=Summarize:%0A{selection}');
});

it('adds and removes a custom menu item', () => {
  render(<SettingsWebLookupSection />);

  fireEvent.click(screen.getByRole('button', { name: 'Add menu item' }));
  expect(screen.getByDisplayValue('New menu item')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Remove New menu item' }));
  expect(screen.queryByDisplayValue('New menu item')).toBeNull();
});
