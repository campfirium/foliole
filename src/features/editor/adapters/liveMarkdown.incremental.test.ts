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

describe('liveMarkdown inline rendering', () => {
  it('renders GFM strikethrough while hiding delimiters in preview mode', () => {
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: 'Keep ~~removed~~ text.' });

    expect(host.querySelector('.cm-md-strikethrough')?.textContent).toBe('removed');
    expect(host.querySelector('.cm-content')?.textContent).toBe('Keep removed text.');

    adapter.destroy();
  });

  it('renders source highlight separately from Foliole anchor decorations', () => {
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '==highlight== {{cloze}} [...]' });

    expect(host.querySelector('.cm-md-source-highlight')?.textContent).toBe('highlight');
    expect(host.querySelector('.cm-md-highlight')).toBeNull();
    expect(host.querySelector('.cm-md-cloze')).toBeNull();
    expect(host.querySelector('.cm-md-cloze-placeholder')).toBeNull();
    expect(host.querySelector('.cm-content')?.textContent).toBe('highlight {{cloze}} [...]');

    adapter.destroy();
  });

  it('routes GFM autolinks through the in-app link handler', () => {
    const host = createHost();
    const onOpenExternalLink = vi.fn();
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'Read https://example.com now.',
      onOpenExternalLink
    });

    const link = host.querySelector('[data-md-link-url="https://example.com"]');
    expect(link?.textContent).toBe('https://example.com');

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 320, clientY: 240 }));

    expect(onOpenExternalLink).toHaveBeenCalledWith({
      anchorPoint: { x: 320, y: 240 },
      href: 'https://example.com'
    });
    expect(bridgeSpies.openExternalUrl).not.toHaveBeenCalled();

    adapter.destroy();
  });

  it('renders GFM task list markers as checkbox presentation', () => {
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '- [x] Done\n- [ ] Todo' });

    expect(host.querySelectorAll('.cm-md-task-checkbox')).toHaveLength(2);
    expect(host.querySelectorAll('.cm-md-task-checkbox[data-md-task-checked="true"]')).toHaveLength(1);
    expect(host.querySelector('.cm-content')?.textContent).toContain('Done');
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('[x]');

    adapter.destroy();
  });
});

describe('liveMarkdown block rendering', () => {
  it('hides heading markers in preview even on the cursor line', () => {
    setMarkdownSyntaxVisibility('visible');
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '# Title\n\n## Section' });

    adapter.setSelection({ from: 1, to: 1 });

    expect(host.querySelectorAll('.cm-md-heading-syntax-hidden')).toHaveLength(2);
    expect(host.querySelector('.cm-line-h1 .cm-md-heading-syntax-hidden')?.textContent).toBe('# ');
    expect(host.querySelector('.cm-line-h2 .cm-md-heading-syntax-hidden')?.textContent).toBe('## ');

    adapter.destroy();
  });

  it('renders strong-wrapped ATX compatibility headings as headings', () => {
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '**# Article Title**\n\n**## Deep dive**' });

    expect(host.querySelector('.cm-line-h1 .cm-md-heading-syntax-hidden')?.textContent).toBe('**# ');
    expect(host.querySelector('.cm-line-h2 .cm-md-heading-syntax-hidden')?.textContent).toBe('**## ');
    expect(host.querySelectorAll('.cm-md-heading-syntax-hidden')).toHaveLength(4);

    adapter.destroy();
  });

  it('renders wiki aliases, callout labels, and plain Obsidian tags', () => {
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '[[Folder/Beta note|Beta alias]]\n\n> [!note]\n> Callout body.\n\n#tag/sample'
    });

    expect(host.querySelector('[data-md-link-node-title="Folder/Beta note"]')?.textContent).toBe('Beta alias');
    expect(host.querySelector('.cm-md-callout-title')?.textContent).toBe('Note');
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('[!note]');
    expect(host.querySelector('.cm-content')?.textContent).toContain('#tag/sample');
    expect(host.querySelector('.cm-line-h1')?.textContent ?? '').not.toContain('#tag/sample');

    adapter.destroy();
  });
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
