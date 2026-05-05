import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it } from 'vitest';

import { liveMarkdownTheme } from './liveMarkdownTheme';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = '';
});

it('uses dedicated selection, highlight, and cloze color tokens', () => {
  const host = document.createElement('div');
  document.body.append(host);

  view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: 'Sample text',
      extensions: [liveMarkdownTheme]
    })
  });

  const cssText = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');

  expect(cssText).toContain('cm-md-highlight');
  expect(cssText).toContain('cm-md-cloze');
  expect(cssText).toContain('cm-selectionBackground');
  expect(cssText).toContain('.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground');
  expect(cssText).toContain('cm-paragraph-marker-line');
  expect(cssText).toContain('data-paragraph-marker-active');
  expect(cssText).toContain('var(--app-selection-surface-color)');
  expect(cssText).toContain('var(--app-text-selection-bg-color)');
  expect(cssText).toContain('background-color: transparent;');
  expect(cssText).toContain('-webkit-text-fill-color: inherit;');
  expect(cssText).toContain('var(--app-highlight-surface-color)');
  expect(cssText).toContain('var(--app-cloze-surface-color)');
  expect(cssText).toContain('var(--app-diff-added-surface-color)');
  expect(cssText).toContain('var(--app-diff-removed-surface-color)');
  expect(cssText).toContain('var(--app-accent-color)');
  expect(cssText).toContain('.cm-md-strong');
  expect(cssText).toContain('font-weight: 600;');
  expect(cssText).toContain('.cm-md-strikethrough');
  expect(cssText).toContain('text-decoration: line-through;');
  expect(cssText).toContain('.cm-cursor');
  expect(cssText).toContain('var(--content-panel-text-color, var(--color-text-primary))');
  expect(cssText).toContain('border-left-color: var(--color-text-primary);');
  expect(cssText).toContain('caret-color: var(--color-text-primary);');
  expect(cssText).toContain('padding: 0.25rem var(--document-content-inline-padding, 1.5rem) var(--editor-content-padding-bottom, 0.6rem);');
});
