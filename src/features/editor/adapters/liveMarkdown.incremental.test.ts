import { afterEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({
  buildFrontmatterDecorationState: vi.fn()
}));

const bridgeSpies = vi.hoisted(() => ({
  openExternalUrl: vi.fn()
}));

vi.mock('../../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn(() => null),
  openExternalUrl: bridgeSpies.openExternalUrl
}));

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

afterEach(() => {
  document.body.innerHTML = '';
  setMarkdownSyntaxVisibility('hidden');
  spies.buildFrontmatterDecorationState.mockClear();
});

describe('liveMarkdown runtime behavior', () => {
  it('opens matching workspace nodes when a wiki link is clicked', () => {
    const host = createHost();
    const onOpenNodeLink = vi.fn();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: 'See [[Alpha topic]] next.', onOpenNodeLink });

    const link = host.querySelector('[data-md-link-node-title="Alpha topic"]');
    expect(link).not.toBeNull();

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenNodeLink).toHaveBeenCalledWith('Alpha topic');
    expect(bridgeSpies.openExternalUrl).not.toHaveBeenCalled();

    adapter.destroy();
  });

  it('emits hover preview requests for wiki links and clears them on leave', () => {
    const host = createHost();
    const onPreviewNodeLink = vi.fn();
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'See [[Alpha topic]] next.',
      onPreviewNodeLink
    });

    const link = host.querySelector('[data-md-link-node-title="Alpha topic"]');
    expect(link).not.toBeNull();

    link?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(onPreviewNodeLink).toHaveBeenCalledWith({
      anchorRect: expect.objectContaining({
        bottom: expect.any(Number),
        height: expect.any(Number),
        left: expect.any(Number),
        right: expect.any(Number),
        top: expect.any(Number),
        width: expect.any(Number)
      }),
      title: 'Alpha topic'
    });

    link?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(onPreviewNodeLink).toHaveBeenLastCalledWith(null);

    adapter.destroy();
  });

  it('routes markdown links through the in-app link handler', () => {
    const host = createHost();
    const onOpenExternalLink = vi.fn();
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'Read [docs](https://example.com/docs).',
      onOpenExternalLink
    });

    const link = host.querySelector('[data-md-link-url="https://example.com/docs"]');
    expect(link).not.toBeNull();

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 320, clientY: 240 }));

    expect(onOpenExternalLink).toHaveBeenCalledWith({
      anchorPoint: { x: 320, y: 240 },
      href: 'https://example.com/docs'
    });
    expect(bridgeSpies.openExternalUrl).not.toHaveBeenCalled();

    adapter.destroy();
  });
});

describe('liveMarkdown frontmatter updates', () => {
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
