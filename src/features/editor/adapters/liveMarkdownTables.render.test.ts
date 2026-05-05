import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

beforeEach(() => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('live markdown thematic break rendering', () => {
  it('renders thematic breaks as horizontal rule widgets', () => {
    const { adapter, host } = createAdapterHost('Before\n---\nAfter');

    expect(host.querySelector('.cm-md-thematic-break')).not.toBeNull();
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('---');

    adapter.destroy();
  });
});

describe('live markdown table rendering', () => {
  it('renders an inactive GFM table as a table widget', () => {
    const { adapter, host } = createAdapterHost('| A | B |\n| --- | --- |\n| 1 | 2 |');

    const table = host.querySelector('.cm-md-table-widget table');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('th')).toHaveLength(2);
    expect(table?.querySelectorAll('td')).toHaveLength(2);
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('| --- | --- |');

    adapter.destroy();
  });

  it('dispatches a table preview request from the table widget action', () => {
    const { adapter, host } = createAdapterHost('| A | B |\n| --- | --- |\n| 1 | 2 |');
    const previewHandler = vi.fn();
    host.addEventListener('foliole:markdown-table-preview', previewHandler);

    (host.querySelector('.cm-md-table-preview-button') as HTMLButtonElement | null)?.click();

    expect(previewHandler).toHaveBeenCalledTimes(1);
    expect(previewHandler.mock.calls[0]?.[0].detail.table.columnCount).toBe(2);

    adapter.destroy();
  });

  it('keeps the table preview visible when the cursor is inside the table', () => {
    const { adapter, host } = createAdapterHost('| A | B |\n| --- | --- |\n| 1 | 2 |');

    adapter.focus();
    adapter.setSelection({ from: 2, to: 2 });

    expect(host.querySelector('.cm-md-table-widget')).not.toBeNull();
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('| --- | --- |');

    adapter.destroy();
  });

  it('projects table-scoped highlight and cloze decorations into inactive cells', () => {
    const content = '| A | B |\n| --- | --- |\n| Alpha | Beta |';
    const { adapter, host } = createAdapterHost(content);
    const alphaFrom = content.indexOf('Alpha');
    const betaFrom = content.indexOf('Beta');

    adapter.setTextAnchorDecorations?.([
      { from: alphaFrom, kind: 'highlight', to: alphaFrom + 'Alpha'.length },
      { from: betaFrom, kind: 'cloze', to: betaFrom + 'Beta'.length }
    ]);

    expect(host.querySelector('.cm-md-table-cell.cm-md-highlight')?.textContent).toBe('Alpha');
    expect(host.querySelector('.cm-md-table-cell.cm-md-cloze')?.textContent).toBe('Beta');

    adapter.destroy();
  });

  it('renders GFM strikethrough inside inactive table cells', () => {
    const { adapter, host } = createAdapterHost('| A |\n| --- |\n| ~~Gone~~ |');

    expect(host.querySelector('td.cm-md-table-cell .cm-md-strikethrough')?.textContent).toBe('Gone');
    expect(host.querySelector('td.cm-md-table-cell')?.textContent).toBe('Gone');

    adapter.destroy();
  });

  it('renders strong text inside inactive table cells', () => {
    const { adapter, host } = createAdapterHost('| A |\n| --- |\n| **Important** |');

    expect(host.querySelector('td.cm-md-table-cell .cm-md-strong')?.textContent).toBe('Important');
    expect(host.querySelector('td.cm-md-table-cell')?.textContent).toBe('Important');

    adapter.destroy();
  });

  it('renders GFM autolinks inside inactive table cells', () => {
    const { adapter, host } = createAdapterHost('| A |\n| --- |\n| https://example.com |');

    const link = host.querySelector('td.cm-md-table-cell [data-md-link-url="https://example.com"]');
    expect(link?.textContent).toBe('https://example.com');

    adapter.destroy();
  });
});
