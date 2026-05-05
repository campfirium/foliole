import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

describe('live markdown table rendering', () => {
  beforeEach(() => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders an inactive GFM table as a table widget', () => {
    const { adapter, host } = createAdapterHost('| A | B |\n| --- | --- |\n| 1 | 2 |');

    const table = host.querySelector('.cm-md-table-widget table');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('th')).toHaveLength(2);
    expect(table?.querySelectorAll('td')).toHaveLength(2);
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('| --- | --- |');

    adapter.destroy();
  });

  it('returns the active table block to markdown source editing', () => {
    const { adapter, host } = createAdapterHost('| A | B |\n| --- | --- |\n| 1 | 2 |');

    adapter.focus();
    adapter.setSelection({ from: 2, to: 2 });

    expect(host.querySelector('.cm-md-table-widget')).toBeNull();
    expect(host.querySelector('.cm-content')?.textContent).toContain('| --- | --- |');

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
});
