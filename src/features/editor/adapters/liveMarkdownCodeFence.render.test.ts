import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { initializeMermaid, renderMermaid } = vi.hoisted(() => ({
  initializeMermaid: vi.fn(),
  renderMermaid: vi.fn(async (id: string, source: string) => ({
    bindFunctions: undefined,
    svg: `<svg data-mermaid-id="${id}"><text>${source}</text></svg>`
  }))
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMermaid,
    render: renderMermaid
  }
}));

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { setEditorDisplayMode } from '../model/editorDisplayMode';
import { MARKDOWN_MERMAID_PREVIEW_EVENT } from '../model/markdownMermaidPreview';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

beforeEach(() => {
  initializeMermaid.mockClear();
  renderMermaid.mockClear();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  setEditorDisplayMode('preview');
});

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-resolved-base-color');
  document.documentElement.style.removeProperty('--color-foreground');
  document.documentElement.style.removeProperty('--color-bg-panel');
  document.documentElement.style.removeProperty('--color-bg-elevated');
  document.documentElement.style.removeProperty('--color-border-strong');
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
});

describe('live markdown mermaid rendering', () => {
  it('renders mermaid fenced blocks as diagrams without changing editor content', async () => {
    document.documentElement.style.setProperty('--color-foreground', '32 33 36');
    const initialContent = '```mermaid\ngantt\n  title Plan\n```\nAfter';
    const { adapter, host } = createAdapterHost(initialContent);

    await waitFor(() => {
      expect(host.querySelector('.cm-md-mermaid-widget svg')).not.toBeNull();
    });
    expect(host.querySelector('.cm-md-mermaid-widget')?.textContent).toContain('gantt');
    expect(host.textContent).not.toContain('```mermaid');
    expect(initializeMermaid).toHaveBeenCalledWith(
      expect.objectContaining({
        themeVariables: expect.objectContaining({
          primaryTextColor: 'rgb(32, 33, 36)',
          textColor: 'rgb(32, 33, 36)'
        })
      })
    );
    expect(adapter.getContent()).toBe(initialContent);

    adapter.destroy();
  });
});

describe('live markdown mermaid preview action', () => {
  it('opens mermaid preview through the shared table-style action', async () => {
    const { adapter, host } = createAdapterHost('```mermaid\ngantt\n  title Plan\n```');
    const previewHandler = vi.fn();
    host.addEventListener(MARKDOWN_MERMAID_PREVIEW_EVENT, previewHandler);

    await waitFor(() => {
      expect(host.querySelector('.cm-md-mermaid-widget svg')).not.toBeNull();
    });
    expect(host.querySelector('.cm-md-mermaid-button')).toBeNull();
    expect(host.textContent).not.toContain('Code');
    (host.querySelector('.cm-md-mermaid-preview-button') as HTMLButtonElement | null)?.click();

    expect(previewHandler).toHaveBeenCalledTimes(1);
    expect((previewHandler.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({ source: 'gantt\n  title Plan' });

    adapter.destroy();
  });
});

describe('live markdown imported mermaid rendering', () => {
  it('reinitializes mermaid with dark theme colors when the app theme changes', async () => {
    document.documentElement.dataset.resolvedBaseColor = 'dark';
    document.documentElement.style.setProperty('--color-foreground', '232 230 223');
    const { adapter, host } = createAdapterHost('```mermaid\nquadrantChart\n  title Map\n```');

    await waitFor(() => {
      expect(host.querySelector('.cm-md-mermaid-widget svg')).not.toBeNull();
    });
    expect(initializeMermaid).toHaveBeenCalledWith(
      expect.objectContaining({
        themeVariables: expect.objectContaining({
          darkMode: true,
          textColor: 'rgb(232, 230, 223)'
        })
      })
    );

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
