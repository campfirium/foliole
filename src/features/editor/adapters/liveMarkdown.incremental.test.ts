import { afterEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({
  addAnchorTagDecorations: vi.fn(),
  buildFrontmatterDecorationState: vi.fn()
}));

vi.mock('../../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn(() => null),
  openExternalUrl: vi.fn()
}));

vi.mock('./liveMarkdownAnchors', async () => {
  const actual = await vi.importActual<typeof import('./liveMarkdownAnchors')>('./liveMarkdownAnchors');
  return {
    ...actual,
    addAnchorTagDecorations: (ranges: Parameters<typeof actual.addAnchorTagDecorations>[0], content: string) => {
      spies.addAnchorTagDecorations(content);
      actual.addAnchorTagDecorations(ranges, content);
    }
  };
});

vi.mock('./liveMarkdownFrontmatter', async () => {
  const actual = await vi.importActual<typeof import('./liveMarkdownFrontmatter')>('./liveMarkdownFrontmatter');
  return {
    ...actual,
    buildFrontmatterDecorationState: (view: Parameters<typeof actual.buildFrontmatterDecorationState>[0]) => {
      spies.buildFrontmatterDecorationState();
      return actual.buildFrontmatterDecorationState(view);
    }
  };
});

import { setMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => []
  });
}

function createHost() {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

describe('liveMarkdown incremental static decorations', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    setMarkdownSyntaxVisibility('hidden');
    spies.addAnchorTagDecorations.mockClear();
    spies.buildFrontmatterDecorationState.mockClear();
  });

  it('keeps anchor decorations mapped without rescanning on plain text edits', () => {
    const content = '<highlight id="1">hello</highlight id="1"> world';
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });

    spies.addAnchorTagDecorations.mockClear();
    const from = content.indexOf('world');
    adapter.replaceRange(from, from + 'world'.length, 'planet');

    expect(spies.addAnchorTagDecorations).not.toHaveBeenCalled();
    expect(host.textContent).toContain('hello planet');
    expect(host.textContent).not.toContain('<highlight');

    adapter.destroy();
  });

  it('rescans anchor decorations when an anchor tag itself changes', () => {
    const content = '<highlight id="1">hello</highlight id="1"> world';
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });

    spies.addAnchorTagDecorations.mockClear();
    const from = content.indexOf('highlight');
    adapter.replaceRange(from, from + 'highlight'.length, 'cloze');

    expect(spies.addAnchorTagDecorations).toHaveBeenCalledTimes(1);

    adapter.destroy();
  });

  it('skips frontmatter rebuilds when edits stay below the inspected header region', () => {
    const content = ['---', 'author: Jane', '---', '', '# Title', '', 'Paragraph'].join('\n');
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });

    spies.buildFrontmatterDecorationState.mockClear();
    const from = content.indexOf('Paragraph');
    adapter.replaceRange(from, from + 'Paragraph'.length, 'Paragraph updated');

    expect(spies.buildFrontmatterDecorationState).not.toHaveBeenCalled();
    expect(host.querySelector('.cm-md-frontmatter-summary')?.textContent).toBe('Jane');

    adapter.destroy();
  });

  it('rebuilds frontmatter decorations when the metadata block changes', () => {
    const content = ['---', 'author: Jane', '---', '', '# Title', '', 'Paragraph'].join('\n');
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });

    spies.buildFrontmatterDecorationState.mockClear();
    const from = content.indexOf('Jane');
    adapter.replaceRange(from, from + 'Jane'.length, 'Janet');

    expect(spies.buildFrontmatterDecorationState).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.cm-md-frontmatter-summary')?.textContent).toBe('Janet');

    adapter.destroy();
  });
});
