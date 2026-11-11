import { afterEach, describe, expect, it, vi } from 'vitest';

import { setEditorDisplayMode } from '../model/editorDisplayMode';
import { setMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => []
  });
}

afterEach(() => {
  document.body.replaceChildren();
  setEditorDisplayMode('preview');
  setMarkdownSyntaxVisibility('hidden');
});

it.each(['- ', '  - ', '1. ', '- [ ] '])('moves across the rendered %j prefix in one step', (prefix) => {
  setEditorDisplayMode('preview');
  setMarkdownSyntaxVisibility('hidden');
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: prefix + 'Text' });
  try {
    const content = host.querySelector('.cm-content')!;
    expect(content.querySelector('.cm-md-prefix-widget')).not.toBeNull();
    adapter.setSelection({ from: prefix.length, to: prefix.length });

    content.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    expect(adapter.getSelection()).toEqual({ from: 0, to: 0 });
    content.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    expect(adapter.getSelection()).toEqual({ from: prefix.length, to: prefix.length });
  } finally {
    adapter.destroy();
  }
});

it('removes the whole rendered list prefix including extra spaces with one Backspace', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '-  Text' });
  try {
    const content = host.querySelector('.cm-content')!;
    expect(content.querySelector('.cm-md-prefix-widget')).not.toBeNull();
    adapter.setSelection({ from: 3, to: 3 });

    content.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));
    expect(adapter.getContent()).toBe('Text');
  } finally {
    adapter.destroy();
  }
});

it('removes the whole rendered list prefix with one forward Delete', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '- Text' });
  try {
    const content = host.querySelector('.cm-content')!;
    expect(content.querySelector('.cm-md-prefix-widget')).not.toBeNull();
    adapter.setSelection({ from: 0, to: 0 });

    content.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
    expect(adapter.getContent()).toBe('Text');
  } finally {
    adapter.destroy();
  }
});

it('allows character-by-character editing when the prefix is shown as Markdown source', () => {
  setEditorDisplayMode('source');
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '- Text' });
  try {
    const content = host.querySelector('.cm-content')!;
    expect(content.querySelector('.cm-md-prefix-widget')).toBeNull();
    adapter.setSelection({ from: 2, to: 2 });

    content.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    expect(adapter.getSelection()).toEqual({ from: 1, to: 1 });
  } finally {
    adapter.destroy();
  }
});

describe('live Markdown task checkbox', () => {
  it('toggles the source task marker through the normal document input path', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onChange = vi.fn();
    const onDocumentInput = vi.fn();
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '1. [ ] Todo',
      onChange,
      onDocumentInput
    });
    adapter.setNodeId('node-1');
    const checkbox = host.querySelector<HTMLInputElement>('.cm-md-task-checkbox');

    expect(checkbox?.type).toBe('checkbox');
    expect(checkbox?.checked).toBe(false);
    expect(checkbox?.getAttribute('aria-label')).toBe('Todo');

    checkbox?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(adapter.getContent()).toBe('1. [x] Todo');
    expect(onDocumentInput).toHaveBeenCalledOnce();
    expect(onDocumentInput.mock.calls[0]?.[0]).toMatchObject({
      nodeId: 'node-1',
      textTransactions: [{ userEvent: 'input.list' }]
    });
    expect(host.querySelector('.cm-md-task-checkbox[data-md-task-checked="true"]')).not.toBeNull();
    adapter.destroy();
  });

  it('handles consecutive empty-list Enter commands through the installed keymap', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '- parent\n  - ',
      onChange: vi.fn()
    });
    adapter.setSelection({ from: 13, to: 13 });
    const content = host.querySelector<HTMLElement>('.cm-content');

    content?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(adapter.getContent()).toBe('- parent\n- ');
    content?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(adapter.getContent()).toBe('- parent\n');
    adapter.destroy();
  });
});
