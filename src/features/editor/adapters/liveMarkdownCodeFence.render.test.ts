import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
});
