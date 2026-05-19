import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  addWebLookupEntry,
  getEnabledWebLookupEntries,
  getWebLookupEntries,
  removeWebLookupEntry,
  moveWebLookupEntry,
  resolveWebLookupAction,
  resolveWebLookupUrl,
  updateWebLookupEntry,
  WEB_LOOKUP_QUERY_MAX_LENGTH
} from './webLookupEntries';

beforeEach(() => {
  window.localStorage.clear();
});

it('defaults to ChatGPT then Google while keeping DuckDuckGo hidden', () => {
  expect(getWebLookupEntries().map((entry) => [entry.id, entry.enabled])).toEqual([
    ['chatgpt', true],
    ['google', true],
    ['duckduckgo', false]
  ]);
  expect(getEnabledWebLookupEntries().map((entry) => entry.label)).toEqual([
    'Summarize with ChatGPT',
    'Search with Google'
  ]);
});

it('persists built-in entry visibility through the app settings key', () => {
  updateWebLookupEntry('duckduckgo', { enabled: true });

  expect(getEnabledWebLookupEntries().map((entry) => entry.id)).toEqual([
    'chatgpt',
    'google',
    'duckduckgo'
  ]);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries)).toContain('duckduckgo');
});

it('falls back to safe built-in defaults for invalid stored templates', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, JSON.stringify([
    { id: 'chatgpt', enabled: false },
    { id: 'google', enabled: true, urlTemplate: 'file:///tmp/{query}' },
    { id: 'custom', enabled: true, kind: 'search', label: 'Custom', urlTemplate: 'javascript:alert({selection})' }
  ]));

  const entries = getWebLookupEntries();

  expect(entries.find((entry) => entry.id === 'chatgpt')?.enabled).toBe(false);
  expect(entries.find((entry) => entry.id === 'google')?.urlTemplate).toBe('https://www.google.com/search?q={selection}');
  expect(entries.some((entry) => entry.id === 'custom')).toBe(false);
});

it('resolves lookup URLs with trimmed and bounded selected text', () => {
  const google = getWebLookupEntries().find((entry) => entry.id === 'google');
  expect(google).toBeDefined();

  const url = resolveWebLookupUrl(google!, `  ${'a'.repeat(WEB_LOOKUP_QUERY_MAX_LENGTH + 20)}  `);

  expect(url).toBe(`https://www.google.com/search?q=${'a'.repeat(WEB_LOOKUP_QUERY_MAX_LENGTH)}`);
  expect(resolveWebLookupUrl(google!, '   ')).toBeNull();
});

it('resolves prompt actions from selection or current topic text', () => {
  const entries = getWebLookupEntries();
  const chatgpt = entries.find((entry) => entry.id === 'chatgpt')!;
  const google = entries.find((entry) => entry.id === 'google')!;

  expect(resolveWebLookupAction(chatgpt, { documentText: 'Full topic', selectionText: 'Selected text' })).toEqual({
    kind: 'prompt',
    label: 'Summarize with ChatGPT',
    url: 'https://chatgpt.com/?prompt=Summarize%20the%20following%20selection:%0A%0ASelected%20text'
  });
  expect(resolveWebLookupAction(chatgpt, { documentText: 'Full topic', selectionText: null })).toEqual({
    kind: 'prompt',
    label: 'Summarize with ChatGPT',
    url: 'https://chatgpt.com/?prompt=Summarize%20the%20following%20selection:%0A%0AFull%20topic'
  });
  expect(resolveWebLookupAction(google, { documentText: 'Full topic', selectionText: null })).toBeNull();
});

it('uses the configured label as the context menu text', () => {
  updateWebLookupEntry('chatgpt', { label: 'ChatGPT summarize this' });
  const chatgpt = getWebLookupEntries().find((entry) => entry.id === 'chatgpt')!;

  expect(resolveWebLookupAction(chatgpt, { documentText: 'Full topic', selectionText: 'Selected text' })?.label)
    .toBe('ChatGPT summarize this');
});

it('migrates stored built-in labels that still match old defaults', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, JSON.stringify([
    { id: 'chatgpt', label: 'ChatGPT' },
    { id: 'google', label: 'Google' },
    { id: 'duckduckgo', label: 'DuckDuckGo' }
  ]));

  expect(getWebLookupEntries().map((entry) => entry.label)).toEqual([
    'Summarize with ChatGPT',
    'Search with Google',
    'Search with DuckDuckGo'
  ]);
});

it('moves entries and migrates the old ChatGPT default template', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, JSON.stringify([
    {
      id: 'chatgpt',
      urlTemplate: 'https://chatgpt.com/?prompt=Please summarize the text inside %3Cselection%3E.%0A%3Cselection%3E%0A{selection}%0A%3C%2Fselection%3E'
    }
  ]));

  expect(getWebLookupEntries()[0].urlTemplate).toContain('following selection');
  expect(moveWebLookupEntry('google', 'chatgpt').map((entry) => entry.id)).toEqual([
    'google',
    'chatgpt',
    'duckduckgo'
  ]);
});

it('migrates the previous ChatGPT content default template', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, JSON.stringify([
    {
      id: 'chatgpt',
      urlTemplate: 'https://chatgpt.com/?prompt=Summarize the following content:%0A%0AContent:%0A{selection}'
    }
  ]));

  expect(getWebLookupEntries()[0].urlTemplate).toContain('following selection');
});

it('adds and removes custom selection-only entries', () => {
  const entries = addWebLookupEntry();
  const custom = entries.find((entry) => !entry.builtIn);

  expect(custom).toMatchObject({
    enabled: true,
    kind: 'search',
    label: 'New menu item',
    urlTemplate: 'https://example.com/?q={selection}'
  });
  expect(removeWebLookupEntry(custom!.id).some((entry) => entry.id === custom!.id)).toBe(false);
});

it('persists menu links and truncates the inserted selection', () => {
  updateWebLookupEntry('chatgpt', {
    urlTemplate: 'https://chatgpt.com/?prompt=Summarize:%0A<selection>%0A{selection}%0A</selection>'
  });
  const chatgpt = getWebLookupEntries().find((entry) => entry.id === 'chatgpt')!;
  const action = resolveWebLookupAction(chatgpt, { documentText: 'a'.repeat(WEB_LOOKUP_QUERY_MAX_LENGTH + 20) });

  expect(action?.url).toBe(`https://chatgpt.com/?prompt=Summarize:%0A%3Cselection%3E%0A${'a'.repeat(WEB_LOOKUP_QUERY_MAX_LENGTH)}%0A%3C/selection%3E`);
});
