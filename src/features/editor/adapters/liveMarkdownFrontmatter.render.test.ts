import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

import { setEditorDisplayMode } from '../model/editorDisplayMode';
import { setFrontmatterDisplayMode } from '../model/frontmatterDisplayModeSetting';
import { FRONTMATTER_META_FIELDS_DEFAULT, setFrontmatterMetaFields } from '../model/frontmatterMetaFieldsSetting';
import { setMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';
import type { CodeMirrorEditorAdapterOptions } from './codeMirrorEditorAdapterSupport';

function createAdapterHost(initialContent: string, options: Partial<CodeMirrorEditorAdapterOptions> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent, ...options });
  return { adapter, host };
}

function getLineTexts(host: HTMLElement, selector = '.cm-line') {
  return Array.from(host.querySelectorAll<HTMLElement>(selector)).map(
    (line) => line.textContent?.replace(/\u200b/g, '') ?? ''
  );
}

const DISCOURSE_FRONTMATTER_CONTENT = [
  '---',
  'foliole:',
  '  publish:',
  '    schemaVersion: 1',
  '    discourse:',
  '      site: https://forum.campfirium.com',
  '      topicId: 869',
  '      postId: 1041',
  '      url: https://forum.campfirium.com/t/topic/869',
  '      categoryId: 5',
  '      tags:',
  '        - health',
  '      lastPublishedAt: "2026-07-05T03:10:07.438Z"',
  '---',
  '# Title'
].join('\n');

afterEach(() => {
  document.body.innerHTML = '';
  setFrontmatterDisplayMode('compact');
  setFrontmatterMetaFields(FRONTMATTER_META_FIELDS_DEFAULT);
  setEditorDisplayMode('preview');
  setMarkdownSyntaxVisibility('hidden');
});

describe('live markdown frontmatter rendering', () => {
  it('renders top frontmatter as a compact block without visible delimiters', () => {
    const host = document.createElement('div');
    document.body.append(host);

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '---\nauthor: [[Jane Doe]]\ntags:\n  - notes\n---\n# Title'
    });

    expect(host.querySelector('.cm-md-frontmatter-compact')).not.toBeNull();
    expect(host.querySelector('.cm-line.cm-line-h1.cm-line-frontmatter-title')).not.toBeNull();
    expect(host.querySelector('.cm-md-frontmatter-meta-line')?.textContent).toBe('Jane Doe');
    expect((host.textContent ?? '').indexOf('Title')).toBeLessThan((host.textContent ?? '').indexOf('Jane Doe'));
    expect(host.textContent).not.toContain('---');
    expect(host.textContent).not.toContain('[[');
    expect(host.textContent).not.toContain('notes');
    expect(host.textContent).toContain('Title');
    expect(host.textContent).toContain('Meta');

    adapter.destroy();
  });

  it('shows source domains with tooltips and clickable URL values', () => {
    const { adapter, host } = createAdapterHost('---\nsource: https://www.example.com/path\n---\n# Title');

    expect(host.querySelector('.cm-md-frontmatter-meta-line')?.textContent).toBe('example.com');
    const link = host.querySelector<HTMLElement>('.cm-md-frontmatter-meta-link');
    expect(link?.title).toBe('https://www.example.com/path');
    expect(link?.dataset.mdLinkUrl).toBe('https://www.example.com/path');
    expect(link?.getAttribute('href')).toBeNull();
    expect(host.textContent).not.toContain('https://www.example.com/path');

    adapter.destroy();
  });

  it('keeps subdomains, displays non-URL source text, and supports configured aliases', () => {
    setFrontmatterMetaFields(' aliases , source_url|source ');
    const { adapter, host } = createAdapterHost(
      '---\naliases:\n  - Alpha\n  - Beta\nsource: Hacker News\nsource_url: https://news.ycombinator.com/item?id=1\n---\n# Title'
    );

    expect(host.querySelector('.cm-md-frontmatter-meta-line')?.textContent).toBe('Alpha, Beta news.ycombinator.com');

    adapter.destroy();
  });

  it('uses an existing non-URL source value without continuing to later fallback fields', () => {
    const { adapter, host } = createAdapterHost(
      '---\nsource: Hacker News\nsource_url: https://news.ycombinator.com/item?id=1\n---\n# Title'
    );

    expect(host.querySelector('.cm-md-frontmatter-meta-line')?.textContent).toBe('Hacker News');

    adapter.destroy();
  });

  it('shows only Meta when configured fields parse empty or are absent', () => {
    setFrontmatterMetaFields(' ,,, ');
    const { adapter, host } = createAdapterHost('---\nauthor: Jane\n---\n# Title');

    expect(host.querySelector('.cm-md-frontmatter-meta-line')?.textContent).toBe('');
    expect(host.textContent).toContain('Meta');
    expect(host.textContent).not.toContain('Jane');

    adapter.destroy();
  });

});

describe('live markdown frontmatter Discourse metadata', () => {
  it('shows a linked published date for Discourse-managed frontmatter', () => {
    setFrontmatterMetaFields(' ,,, ');
    const onOpenExternalLink = vi.fn();
    const { adapter, host } = createAdapterHost(DISCOURSE_FRONTMATTER_CONTENT, { onOpenExternalLink });

    const metaLine = host.querySelector('.cm-md-frontmatter-meta-line');
    const link = host.querySelector<HTMLElement>('[data-md-link-url="https://forum.campfirium.com/t/topic/869"]');
    expect(metaLine?.textContent).toBe(`Posted ${new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(new Date('2026-07-05T03:10:07.438Z'))}`);
    expect(link?.textContent).toBe(metaLine?.textContent);
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenExternalLink).toHaveBeenCalledWith(expect.objectContaining({
      href: 'https://forum.campfirium.com/t/topic/869'
    }));

    adapter.destroy();
  });
});

describe('live markdown frontmatter interactions', () => {
  it('routes frontmatter URL keys through the in-app link panel handler', () => {
    const onOpenExternalLink = vi.fn();
    const { adapter, host } = createAdapterHost(
      '---\nurl: https://example.com/frontmatter\n---\n# Title',
      { onOpenExternalLink }
    );

    const link = host.querySelector('[data-md-link-url="https://example.com/frontmatter"]');
    expect(link?.textContent).toBe('example.com');
    expect((link as HTMLElement | null)?.getAttribute('href')).toBeNull();

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 180, clientY: 96 }));

    expect(onOpenExternalLink).toHaveBeenCalledWith({
      anchorPoint: { x: 180, y: 96 },
      href: 'https://example.com/frontmatter'
    });

    adapter.destroy();
  });

  it('can expand compact frontmatter into editable full source lines', () => {
    const { adapter, host } = createAdapterHost('---\nauthor: Jane\n---\n# Title');

    host.querySelector<HTMLButtonElement>('.cm-md-frontmatter-toggle')?.click();

    expect(host.querySelector('.cm-md-frontmatter-compact')).toBeNull();
    expect(host.querySelector('.cm-md-frontmatter-meta-line')?.textContent).toBe('Jane');
    expect(host.textContent).toContain('Close');
    expect(host.querySelector<HTMLTextAreaElement>('.cm-md-frontmatter-yaml-input')?.value).toBe('---\nauthor: Jane\n---');
    expect(host.querySelector('.cm-md-frontmatter-yaml')).not.toBeNull();
    expect(host.textContent).not.toContain('YAML');

    adapter.destroy();
  });

  it('ignores the legacy full frontmatter display setting for the default meta view', () => {
    setFrontmatterDisplayMode('full');
    const { adapter, host } = createAdapterHost('---\nauthor: Jane\n---\n# Title');

    expect(host.querySelector('.cm-md-frontmatter-compact')).not.toBeNull();
    expect(host.querySelector<HTMLTextAreaElement>('.cm-md-frontmatter-yaml-input')).toBeNull();

    adapter.destroy();
  });

  it('shows raw frontmatter in source mode', () => {
    setEditorDisplayMode('source');
    const { adapter, host } = createAdapterHost('---\nauthor: Jane\n---\n# Title');

    expect(host.querySelector('.cm-md-frontmatter-compact')).toBeNull();
    expect(host.querySelector('.cm-md-frontmatter-yaml-input')).toBeNull();
    expect(host.querySelector('.cm-content')?.textContent).toContain('---');
    expect(host.querySelector('.cm-content')?.textContent).toContain('author: Jane');

    adapter.destroy();
  });

});

describe('live markdown block rendering', () => {
  it('hides the lone level-one heading in live preview to avoid a duplicated page title', () => {
    setEditorDisplayMode('preview');
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
