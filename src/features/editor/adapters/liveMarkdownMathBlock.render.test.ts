import { EditorView } from '@codemirror/view';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { setEditorDisplayMode } from '../model/editorDisplayMode';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  setEditorDisplayMode('preview');
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

function getAdapterView(adapter: CodeMirrorEditorAdapter) {
  return (adapter as unknown as { view: EditorView }).view;
}

async function expectBlockMathHiddenSourceLinesCollapse() {
  const { adapter, host } = createAdapterHost('Before\n\n$$\n\\frac{a}{b}=c\n$$\n\nAfter');

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-block .katex-display')).not.toBeNull();
  });
  expect(host.querySelectorAll('.cm-line-math-source-hidden').length).toBe(2);

  adapter.destroy();
}

async function expectCollapsedDeleteAfterBlockFormulaDoesNotAppendTextToClosingDelimiter() {
  const content = 'Before\n\n$$\n\\frac{a}{b}=c\n$$\nAfter';
  const to = content.lastIndexOf('$$') + '$$'.length;
  const { adapter } = createAdapterHost(content);
  const view = getAdapterView(adapter);

  adapter.setSelection({ from: to, to });
  view.dispatch({ changes: { from: to, to: to + 1, insert: '' } });

  expect(view.state.doc.toString()).toBe(content);

  adapter.destroy();
}

describe('live Markdown block math rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('collapses hidden source lines inside rendered block formulas', expectBlockMathHiddenSourceLinesCollapse);
  it('does not append following text to a block formula closing delimiter from a collapsed cursor', expectCollapsedDeleteAfterBlockFormulaDoesNotAppendTextToClosingDelimiter);
});
