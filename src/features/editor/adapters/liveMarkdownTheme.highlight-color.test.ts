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
  expect(cssText).toContain('cm-paragraph-marker-line');
  expect(cssText).toContain('data-paragraph-marker-active');
  expect(cssText).toContain('var(--app-selection-surface-color)');
  expect(cssText).toContain('var(--app-highlight-surface-color)');
  expect(cssText).toContain('var(--app-cloze-surface-color)');
  expect(cssText).toContain('var(--app-accent-color)');
});
