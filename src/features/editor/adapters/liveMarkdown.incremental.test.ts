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

  it('renders imported multi-line table highlights in preview mode', () => {
    const content = [
      '# GTD 项目管理方法',
      '',
      '<highlight id="5">你提到的一些 GTD 元素你没用过，但恰恰它们是 GTD 有效运行的关键环节</highlight id="5">：',
      '',
      '<highlight id="6">| 要素 | GTD 原理 | Todoist 中的对应操作 |',
      '| --- | --- | --- |',
      '| **每周回顾** | 保持系统清空 & 当前 | 每周打开「Someday/Waiting/Projects」重新评估 |',
      '| **拖动排序** | 明确今日任务顺序（非重要性排序） | 用拖动或优先级字段安排今日计划 |',
      '| **统一调度到今天** | 临时任务快速执行（反向推导优先级） | Inbox → 今天清空 or 用 Filter 扫描 |</highlight id="6">'
    ].join('\n');
    const host = createHost();
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });

    const highlightTexts = Array.from(host.querySelectorAll('.cm-md-highlight, .cm-md-highlight-overlap')).map((node) =>
      (node.textContent ?? '').trim()
    );

    expect(highlightTexts.some((text) => text.includes('你提到的一些 GTD 元素你没用过'))).toBe(true);
    expect(highlightTexts.some((text) => text.includes('每周回顾'))).toBe(true);

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
