import { moveLineDown, moveLineUp } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it, vi } from 'vitest';

import * as outlineModel from '../model/documentOutline';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

const editors: CodeMirrorEditorAdapter[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); vi.restoreAllMocks(); });

function createEditor(content: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new CodeMirrorEditorAdapter(host, { initialContent: content, nodeId: 'alpha', onChange: vi.fn() });
  editors.push(editor);
  return editor;
}

it('keeps outline parsing lazy without consumers, then maps a retained heading through inactive edits', () => {
  const parse = vi.spyOn(outlineModel, 'extractDocumentOutline');
  const editor = createEditor('# Title\n\n## Kept\nBody');
  editor.replaceRange(8, 8, 'Paragraph\n');
  expect(parse).not.toHaveBeenCalled();
  const source = editor.outline;
  const initial = source.getSnapshot();
  const kept = initial.items.find(item => item.text === 'Kept')!;
  expect(source.getSnapshot()).toBe(initial);
  const updated = vi.fn();
  const unsubscribe = source.subscribe(updated);
  const from = editor.getContent().indexOf('Kept');
  editor.replaceRange(from, from + 'Kept'.length, 'Renamed');
  expect(updated).toHaveBeenCalled();
  expect(source.getSnapshot().items.find(item => item.text === 'Renamed')?.id).toBe(kept.id);
  unsubscribe();
  parse.mockClear();
  editor.replaceRange(8, 8, 'Another paragraph\n');
  editor.replaceRange(8, 8 + 'Another paragraph\n'.length, '');
  expect(parse).not.toHaveBeenCalled();
  const current = source.getSnapshot().items.find(item => item.text === 'Renamed')!;
  expect(current.id).toBe(kept.id);
  expect(current.from).toBe(editor.getContent().indexOf('Renamed'));
});

it('does not reuse a deleted identity for an identical reinserted heading', () => {
  const editor = createEditor('# Title\n\n## Twin\nBody');
  const previous = editor.outline.getSnapshot().items.find(item => item.text === 'Twin')!;
  const from = editor.getContent().indexOf('## Twin');
  editor.replaceRange(from, editor.getContent().length, '');
  editor.replaceRange(from, from, '## Twin\nBody');
  expect(editor.outline.getSnapshot().items.find(item => item.text === 'Twin')?.id).not.toBe(previous.id);
});

it.each([
  { content: '# Title\n## First\n## Second\n## Third', selections: ['First'], command: moveLineDown },
  { content: '# Title\n## Twin\n## A\n## Twin\n## B\n## End', selections: ['A', 'B'], command: moveLineUp },
  { content: '# Title\n## Kept\n\n## Tail', selections: ['\n## Tail'], command: moveLineUp },
  { content: '# Title\n## Kept\n\n## Tail', selections: ['\n## Tail'], command: moveLineDown }
])('retains heading identities for a native line move with selections $selections', ({ content, selections, command }) => {
  const editor = createEditor(content);
  const original = editor.outline.getSnapshot().items;
  editor.setSelectionRanges(selections.map(text => ({ from: content.indexOf(text), to: content.indexOf(text) })));
  expect(editor.getSelectionRanges()).toHaveLength(selections.length);
  const view = (editor as unknown as { view: EditorView }).view;
  expect(command(view)).toBe(true);
  const current = editor.outline.getSnapshot().items;
  expect(new Set(current.map(item => item.id))).toEqual(new Set(original.map(item => item.id)));
  for (const item of current) {
    expect(item.text).toBe(original.find(previous => previous.id === item.id)!.text);
  }
});
