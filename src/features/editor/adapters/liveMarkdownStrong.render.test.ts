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

describe('live markdown strong rendering', () => {
  it('hides malformed triple-star delimiters while rendering strong text', () => {
    const { adapter, host } = createAdapterHost('***小火箭方法。 ***');

    expect(host.querySelector('.cm-md-strong')?.textContent).toBe('小火箭方法。 ');
    expect(host.querySelector('.cm-content')?.textContent).toBe('小火箭方法。 ');

    adapter.destroy();
  });
});
