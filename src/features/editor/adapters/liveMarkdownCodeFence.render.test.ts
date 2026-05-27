import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { renderMermaid } = vi.hoisted(() => ({
  renderMermaid: vi.fn(async (id: string, source: string) => ({
    bindFunctions: undefined,
    svg: `<svg data-mermaid-id="${id}"><text>${source}</text></svg>`
  }))
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: renderMermaid
  }
}));

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { setEditorDisplayMode } from '../model/editorDisplayMode';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

beforeEach(() => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  setEditorDisplayMode('preview');
});

afterEach(() => {
  document.body.innerHTML = '';
  setEditorDisplayMode('preview');
});

describe('live markdown code fence highlighting', () => {
  it('renders TypeScript fenced code tokens without changing editor content', () => {
    const initialContent = '```ts\nconst label = "ok";\nconst count = 1;\n```';
    const { adapter, host } = createAdapterHost(initialContent);

    expect(host.querySelector('.cm-md-code-tok-keyword')?.textContent).toBe('const');
    expect(host.querySelector('.cm-md-code-tok-string')?.textContent).toBe('"ok"');
    expect(host.querySelector('.cm-md-code-tok-number')?.textContent).toBe('1');
    expect(host.querySelector('.cm-content')?.textContent).toBe('const label = "ok";const count = 1;');
    expect(adapter.getContent()).toBe(initialContent);

    adapter.destroy();
  });

  it('keeps unknown fenced code languages as plain code blocks', () => {
    const { adapter, host } = createAdapterHost('```brain\nconst label = "ok";\n```');

    expect(host.querySelector('.cm-line-code')?.textContent).toBe('const label = "ok";');
    expect(host.querySelector('[class*="cm-md-code-tok-"]')).toBeNull();

    adapter.destroy();
  });

  it('keeps source mode fence syntax visible while highlighting code body tokens', () => {
    setEditorDisplayMode('source');
    const { adapter, host } = createAdapterHost('```typescript\nconst count = 1;\n```');

    expect(host.querySelector('.cm-md-syntax-visible')?.textContent).toBe('```typescript');
    expect(host.querySelector('.cm-md-code-tok-keyword')?.textContent).toBe('const');
    expect(host.querySelector('.cm-md-code-tok-number')?.textContent).toBe('1');

    adapter.destroy();
  });

  it('renders mermaid fenced blocks as diagrams without changing editor content', async () => {
    const initialContent = '```mermaid\ngantt\n  title Plan\n```\nAfter';
    const { adapter, host } = createAdapterHost(initialContent);

    await waitFor(() => {
      expect(host.querySelector('.cm-md-mermaid-widget svg')).not.toBeNull();
    });
    expect(host.querySelector('.cm-md-mermaid-widget')?.textContent).toContain('gantt');
    expect(host.textContent).not.toContain('```mermaid');
    expect(adapter.getContent()).toBe(initialContent);

    adapter.destroy();
  });

  it('renders bare gantt and quadrantChart blocks used in imported AI reports', async () => {
    const initialContent = [
      'gantt',
      '  title Plan',
      '  section Now',
      '  Done :milestone, m1, 2026-01-01, 1d',
      '',
      'quadrantChart',
      '  title Map',
      '  x-axis Easy --> Deep',
      '  y-axis Broad --> Expert',
      '  A: [0.2, 0.3]'
    ].join('\n');
    const { adapter, host } = createAdapterHost(initialContent);

    await waitFor(() => {
      expect(host.querySelectorAll('.cm-md-mermaid-widget svg').length).toBe(2);
    });
    expect(host.querySelectorAll('.cm-line-mermaid-source-hidden').length).toBeGreaterThanOrEqual(6);
    expect(adapter.getContent()).toBe(initialContent);

    adapter.destroy();
  });
});
