import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

import { setMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

function getLineTexts(host: HTMLElement, selector = '.cm-line') {
  return Array.from(host.querySelectorAll<HTMLElement>(selector)).map(
    (line) => line.textContent?.replace(/\u200b/g, '') ?? ''
  );
}

describe('live markdown frontmatter rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    setMarkdownSyntaxVisibility('hidden');
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

  it('hides the lone level-one heading in live preview to avoid a duplicated page title', () => {
    const host = document.createElement('div');
    document.body.append(host);

    const adapter = new CodeMirrorEditorAdapter(host, {
      hideTitleHeading: true,
      initialContent: '# Title\n\nParagraph'
    });

    expect(host.querySelector('.cm-line.cm-line-title-heading-hidden')).not.toBeNull();

    adapter.destroy();
  });

  it('keeps fenced code prefixes literal while preserving normal heading and list preview behavior', () => {
    setMarkdownSyntaxVisibility('hidden');

    const content = '# Heading\n- outside\n1. outside\n\n```md\n# abc\n- item\n1. item\n```';
    const { adapter, host } = createAdapterHost(content);

    expect(getLineTexts(host, '.cm-line.cm-line-code')).toEqual(['# abc', '- item', '1. item']);
    expect(getLineTexts(host)).toContain('# Heading');
    expect(getLineTexts(host)).toContain('• outside');
    expect(host.textContent).not.toContain('- outside');

    const codeHeadingOffset = content.indexOf('# abc');
    adapter.setSelection({ from: codeHeadingOffset, to: codeHeadingOffset });
    expect(getLineTexts(host, '.cm-line.cm-line-code')).toEqual(['# abc', '- item', '1. item']);

    setMarkdownSyntaxVisibility('visible');
    adapter.setSelection({ from: 0, to: 0 });
    expect(getLineTexts(host, '.cm-line.cm-line-code')).toEqual(['# abc', '- item', '1. item']);

    setMarkdownSyntaxVisibility('hidden');
    const codeListOffset = content.indexOf('- item');
    adapter.setSelection({ from: codeListOffset, to: codeListOffset });
    expect(getLineTexts(host, '.cm-line.cm-line-code')).toEqual(['# abc', '- item', '1. item']);

    adapter.destroy();
  });
});
