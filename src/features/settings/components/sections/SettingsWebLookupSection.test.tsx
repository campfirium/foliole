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
  expect(screen.getByDisplayValue('Ask ChatGPT')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Search with Google')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Search with DuckDuckGo')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Show menu item: Search with DuckDuckGo' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.queryByRole('button', { name: 'Remove Ask ChatGPT' })).toBeNull();
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Ask ChatGPT link' }).value)
    .toContain('{title}');
});

it('toggles whether an entry appears in the context menu', () => {
  render(<SettingsWebLookupSection />);

  fireEvent.click(screen.getByRole('switch', { name: 'Show menu item: Search with DuckDuckGo' }));

  expect(getEnabledWebLookupEntries().map((entry) => entry.id)).toEqual([
    'chatgpt',
    'google',
    'duckduckgo'
  ]);
  expect(screen.getByRole('switch', { name: 'Hide menu item: Search with DuckDuckGo' })).toHaveAttribute('aria-checked', 'true');
});

it('updates the ChatGPT menu label and link', () => {
  render(<SettingsWebLookupSection />);

  fireEvent.change(screen.getByRole('textbox', { name: 'Ask ChatGPT menu label' }), {
    target: { value: 'Ask' }
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Ask link' }), {
    target: { value: 'https://chatgpt.com/?prompt=Ask:%0A{selection}' }
  });

  const chatgpt = getEnabledWebLookupEntries().find((entry) => entry.id === 'chatgpt');
  expect(chatgpt?.label).toBe('Ask');
  expect(chatgpt?.urlTemplate).toBe('https://chatgpt.com/?prompt=Ask:%0A{selection}');
});

it('adds and removes a custom menu item', () => {
  render(<SettingsWebLookupSection />);

  fireEvent.click(screen.getByRole('button', { name: 'Add menu item' }));
  expect(screen.getByDisplayValue('New menu item')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Remove New menu item' }));
  expect(screen.queryByDisplayValue('New menu item')).toBeNull();
});

it('reorders menu items by dragging the handle', () => {
  render(<SettingsWebLookupSection />);

  fireEvent.drop(screen.getByTestId('web-lookup-row-chatgpt'), {
    dataTransfer: { getData: () => 'google' }
  });

  expect(getEnabledWebLookupEntries().map((entry) => entry.id)).toEqual(['google', 'chatgpt']);
});
