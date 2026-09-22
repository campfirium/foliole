import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EditorTextEditOperationEntry } from '../model/editorOperationHistory';

import { applyCodeMirrorTextHistory, collectCodeMirrorTextHistoryEntries } from './codeMirrorTextHistory';
import { handleClipboardImagePaste } from './htmlPaste';
import { activeNodeIdFacet } from './liveMarkdownState';

const { importImage, notice } = vi.hoisted(() => ({ importImage: vi.fn(), notice: vi.fn() }));
vi.mock('../../../shared/platform/attachmentImports', () => ({ importClipboardImageAttachment: importImage }));
vi.mock('../../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: notice }));

const ORIGINAL = 'Before IMPORTANT after';
const IMAGE = `![clip](asset://${'a'.repeat(64)}.png)`;
const RESULT = { status: 'imported', storage_key: `${'a'.repeat(64)}.png`, original_name: 'clip.png' };
const views: EditorView[] = [];

function createEditor() {
  const entries: EditorTextEditOperationEntry[] = [];
  const topic = new Compartment();
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: ORIGINAL,
      selection: { anchor: 7, head: 16 },
      extensions: [topic.of(activeNodeIdFacet.of('topic-a')), EditorView.updateListener.of((update) => {
        entries.push(...collectCodeMirrorTextHistoryEntries(update, 'topic-a'));
      })]
    })
  });
  views.push(view);
  return { view, entries, topic, text: () => view.state.doc.toString() };
}

function paste(view: EditorView, count = 1) {
  const file = new File(['png'], 'clip.png', { type: 'image/png' });
  return handleClipboardImagePaste({
    getData: () => '',
    items: Array.from({ length: count }, () => ({ kind: 'file', type: 'image/png', getAsFile: () => file }))
  }, view, 'topic-a');
}

function deferImport() {
  const pending = Promise.withResolvers<unknown>();
  importImage.mockReturnValue(pending.promise);
  return pending;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

it.each([null, { status: 'error' }])('preserves selected source and reports failed import: %j', async (result) => {
  const editor = createEditor();
  importImage.mockResolvedValue(result);
  expect(paste(editor.view)).toBe(true);
  await vi.waitFor(() => expect(notice).toHaveBeenCalled());
  expect(editor.text()).toBe(ORIGINAL);
  expect(editor.view.state.selection.main).toMatchObject({ from: 7, to: 16 });
  expect(editor.entries).toHaveLength(0);
});

it('keeps the document intact while importing and commits one reversible paste', async () => {
  const editor = createEditor();
  const pending = deferImport();
  paste(editor.view);
  expect(editor.text()).toBe(ORIGINAL);
  pending.resolve(RESULT);
  await vi.waitFor(() => expect(editor.text()).toBe(`Before ${IMAGE} after`));
  expect(editor.entries).toHaveLength(1);
  const entry = editor.entries[0]!;
  expect(applyCodeMirrorTextHistory({
    changes: entry.inverseChanges, expectedDigest: entry.afterDigest, expectedNextDigest: entry.beforeDigest,
    selection: entry.beforeSelection, userEvent: 'undo', view: editor.view
  })).toBe(true);
  expect(editor.text()).toBe(ORIGINAL);
  expect(editor.view.state.selection.main).toMatchObject({ from: 7, to: 16 });
  expect(applyCodeMirrorTextHistory({
    changes: entry.forwardChanges, expectedDigest: entry.beforeDigest, expectedNextDigest: entry.afterDigest,
    selection: entry.afterSelection, userEvent: 'redo', view: editor.view
  })).toBe(true);
  expect(editor.text()).toBe(`Before ${IMAGE} after`);
});

it('maps the paste through unrelated typing without moving the current caret', async () => {
  const editor = createEditor();
  const pending = deferImport();
  paste(editor.view);
  editor.view.dispatch({ changes: { from: 0, insert: 'Prefix ' }, selection: { anchor: 7 }, userEvent: 'input.type' });
  pending.resolve(RESULT);
  await vi.waitFor(() => expect(editor.text()).toBe(`Prefix Before ${IMAGE} after`));
  expect(editor.view.state.selection.main.head).toBe(7);
});

it('does not overwrite text the user replaced during the import', async () => {
  const editor = createEditor();
  const pending = deferImport();
  paste(editor.view);
  editor.view.dispatch({ changes: { from: 7, to: 16, insert: 'NEW' }, userEvent: 'input.type' });
  pending.resolve(RESULT);
  await vi.waitFor(() => expect(notice).toHaveBeenCalled());
  expect(editor.text()).toBe('Before NEW after');
});

it('does not apply a late image to a different topic in the same editor', async () => {
  const editor = createEditor();
  const pending = deferImport();
  paste(editor.view);
  editor.view.dispatch({ effects: editor.topic.reconfigure(activeNodeIdFacet.of('topic-b')) });
  pending.resolve(RESULT);
  await vi.waitFor(() => expect(notice).toHaveBeenCalled());
  expect(editor.text()).toBe(ORIGINAL);
});

it('reports rejected imports without changing text or leaving a rejected task', async () => {
  const editor = createEditor();
  importImage.mockRejectedValue(new Error('disk failure'));
  paste(editor.view);
  await vi.waitFor(() => expect(notice).toHaveBeenCalled());
  expect(editor.text()).toBe(ORIGINAL);
});

it('does not replace selected text with a partial multi-image result', async () => {
  const editor = createEditor();
  importImage.mockResolvedValueOnce(RESULT).mockResolvedValueOnce({ status: 'error' });
  paste(editor.view, 2);
  await vi.waitFor(() => expect(notice).toHaveBeenCalled());
  expect(editor.text()).toBe(ORIGINAL);
});

it('does not write a late result after the editor is destroyed', async () => {
  const editor = createEditor();
  const pending = deferImport();
  paste(editor.view);
  editor.view.destroy();
  views.splice(views.indexOf(editor.view), 1);
  pending.resolve(RESULT);
  await vi.waitFor(() => expect(notice).toHaveBeenCalled());
  expect(editor.text()).toBe(ORIGINAL);
});
