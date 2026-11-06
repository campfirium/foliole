import { moveLineUp } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from '../../features/editor/adapters/CodeMirrorEditorAdapter';
import { setConnectedEditorAdapter } from '../../features/editor/adapters/editorAdapterConnection';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarOutlinePanel } from './WorkspaceRightSidebarOutlinePanel';

const editors: CodeMirrorEditorAdapter[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(editor => editor.destroy()); });

function fixture(content: string, connected = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new CodeMirrorEditorAdapter(host, { initialContent: content, nodeId: 'alpha', onChange: vi.fn() });
  editors.push(editor);
  const editorAdapterRef = { current: connected ? editor : null };
  const reveal = vi.fn();
  const panel = (contextNodeId = 'alpha') => <WorkspaceRightSidebarOutlinePanel
    activePosition={0} content={editor.getContent()} onRevealPosition={reveal}
    {...{ contextNodeId, editorAdapterRef }} />;
  const view = renderWithLocalization(panel());
  const edit = (from: number, to: number, inserted: string) => {
    act(() => editor.replaceRange(from, to, inserted));
    view.rerender(panel());
  };
  return { edit, editor, editorAdapterRef, host, panel, reveal, view };
}

it('keeps a surviving heading focused through preceding edits and rename, then navigates to its current position', () => {
  const app = fixture('# Title\n\nBody\n\n## First\n\n## Target');
  const target = screen.getByRole('button', { name: 'Target' });
  target.focus();
  const insertion = app.editor.getContent().indexOf('Body');
  app.edit(insertion, insertion, 'More body\n');
  expect(target).toHaveFocus();
  app.edit(insertion, insertion + 'More body\n'.length, '');
  expect(target).toHaveFocus();

  const from = app.editor.getContent().indexOf('Target');
  app.edit(from, from + 'Target'.length, 'Renamed');
  expect(screen.getByRole('button', { name: 'Renamed' })).toBe(target);
  expect(target).toHaveFocus();
  const marker = app.editor.getContent().indexOf('## Renamed');
  app.edit(marker, marker, '#');
  expect(target).toHaveFocus();
  fireEvent.click(target);
  expect(app.reveal).toHaveBeenLastCalledWith(app.editor.getContent().indexOf('Renamed'));
});

it('keeps duplicate headings distinct when earlier duplicates are inserted and deleted', () => {
  const app = fixture('# Title\n\n## Twin\nFirst body\n\n## Twin\nSecond body');
  const original = screen.getAllByRole('button', { name: 'Twin' });
  original[1]!.focus();
  const insertion = app.editor.getContent().indexOf('## Twin');
  app.edit(insertion, insertion, '## Twin\nInserted body\n\n');
  expect(original[1]).toHaveFocus();
  const afterInsertion = screen.getAllByRole('button', { name: 'Twin' });
  expect(afterInsertion[2]).toBe(original[1]);
  fireEvent.click(afterInsertion[2]!);
  expect(app.reveal).toHaveBeenLastCalledWith(app.editor.getContent().lastIndexOf('Twin'));

  const deletedFrom = app.editor.getContent().indexOf('## Twin\nFirst body');
  const deletedTo = app.editor.getContent().indexOf('## Twin\nSecond body');
  app.edit(deletedFrom, deletedTo, '');
  expect(original[1]).toHaveFocus();
  const focusedFrom = app.editor.getContent().indexOf('## Twin\nSecond body');
  app.edit(focusedFrom, app.editor.getContent().length, '');
  expect(original[1]).not.toBeInTheDocument();
  app.edit(focusedFrom, focusedFrom, '## Twin\nReinserted body');
  expect(screen.getAllByRole('button', { name: 'Twin' })[1]).not.toHaveFocus();
});

it('does not carry a heading interaction into a different material with identical text', () => {
  const app = fixture('# Title\n\n## Repeated');
  const previous = screen.getByRole('button', { name: 'Repeated' });
  previous.focus();
  act(() => app.editor.setNodeId('beta'));
  app.view.rerender(app.panel('beta'));
  expect(previous).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Repeated' })).not.toHaveFocus();
});

it('rebuilds interactions after an external replacement rather than guessing from matching headings', () => {
  const app = fixture('# Title\n\n## Repeated\nOriginal body');
  const previous = screen.getByRole('button', { name: 'Repeated' });
  previous.focus();
  act(() => app.editor.setContent('# Title\n\n## Repeated\nExternally replaced body'));
  app.view.rerender(app.panel());
  expect(previous).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Repeated' })).not.toHaveFocus();
});

it('updates from real editor input without waiting for a parent content rerender', () => {
  const app = fixture('# Title\n\n## Live heading');
  const heading = screen.getByRole('button', { name: 'Live heading' });
  heading.focus();
  const from = app.editor.getContent().indexOf('Live heading');
  act(() => app.editor.replaceRange(from, from + 'Live heading'.length, 'Current heading'));
  expect(screen.getByRole('button', { name: 'Current heading' })).toBe(heading);
  expect(heading).toHaveFocus();
  fireEvent.click(heading);
  expect(app.reveal).toHaveBeenLastCalledWith(app.editor.getContent().indexOf('Current heading'));
});

it('connects a late editor, detaches it, and reads current content on reconnection', () => {
  const app = fixture('# Title\n\n## Attached', false);
  act(() => setConnectedEditorAdapter(app.editorAdapterRef, app.editor));
  expect(screen.getByRole('button', { name: 'Attached' })).toBeVisible();
  act(() => setConnectedEditorAdapter(app.editorAdapterRef, null));
  act(() => app.editor.replaceRange(12, app.editor.getContent().length, 'Updated while detached'));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  act(() => setConnectedEditorAdapter(app.editorAdapterRef, app.editor));
  expect(screen.getByRole('button', { name: 'Updated while detached' })).toBeVisible();
});

it('keeps an unaffected heading focused while replaced sections reorder and still navigate correctly', () => {
  const app = fixture('# Title\n\n## First\nOne\n\n## Second\nTwo\n\n## Kept\nThree');
  const kept = screen.getByRole('button', { name: 'Kept' });
  kept.focus();
  app.edit(app.editor.getContent().indexOf('## First'), app.editor.getContent().indexOf('## Kept'),
    '## Second\nTwo\n\n## First\nOne\n\n');
  expect(kept).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'First' }));
  expect(app.reveal).toHaveBeenLastCalledWith(app.editor.getContent().indexOf('First'));
});

it('keeps both logical heading rows when the editor moves a line, including the deleted and reinserted neighbor', () => {
  const app = fixture('# Title\n## First\n## Second\n## Third');
  const first = screen.getByRole('button', { name: 'First' });
  const second = screen.getByRole('button', { name: 'Second' });
  const cm = EditorView.findFromDOM(app.host)!;
  const from = app.editor.getContent().indexOf('Second');
  app.editor.setSelection({ from, to: from });
  first.focus();
  act(() => { expect(moveLineUp(cm)).toBe(true); });
  expect(first).toHaveFocus();
  expect(screen.getByRole('button', { name: 'First' })).toBe(first);
  expect(screen.getByRole('button', { name: 'Second' })).toBe(second);
  fireEvent.click(first);
  expect(app.reveal).toHaveBeenLastCalledWith(app.editor.getContent().indexOf('First'));
});
