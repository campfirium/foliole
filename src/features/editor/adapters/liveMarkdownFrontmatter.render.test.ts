import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

describe('live markdown frontmatter rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders top frontmatter as a dedicated metadata block without visible delimiters', () => {
    const host = document.createElement('div');
    document.body.append(host);

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '---\nauthor: [[Jane Doe]]\ntags:\n  - notes\n---\n# Title'
    });

    expect(host.querySelector('.cm-md-frontmatter-summary')).not.toBeNull();
    expect(host.querySelector('.cm-md-frontmatter-summary')?.textContent).toBe('Jane Doe  ·  notes');
    expect(host.textContent).not.toContain('---');
    expect(host.textContent).not.toContain('[[');
    expect(host.textContent).not.toContain('author:');
    expect(host.textContent).toContain('Title');

    adapter.destroy();
  });
});
