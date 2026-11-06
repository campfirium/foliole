import { moveLineUp } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from '../../features/editor/adapters/CodeMirrorEditorAdapter';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentOutlineLayer } from './DocumentOutlineLayer';
import { WorkspaceRightSidebarOutlinePanel } from './WorkspaceRightSidebarOutlinePanel';

const editors: CodeMirrorEditorAdapter[] = [];
afterEach(() => {
  cleanup();
  editors.splice(0).forEach(editor => editor.destroy());
  vi.useRealTimers();
});

function fixture(withSidebar = true) {
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const initial = '# Title\nBody\n## Twin\nFirst\n## Twin\nSecond\n## Target\nLast';
  const editor = new CodeMirrorEditorAdapter(host, { initialContent: initial, nodeId: 'alpha', onChange: vi.fn() });
  editors.push(editor);
  const connection = { current: editor };
  const reveal = vi.fn();
  const panels = (nodeId = 'alpha') => <>
    {withSidebar && <WorkspaceRightSidebarOutlinePanel activePosition={0} content={editor.getContent()}
      contextNodeId={nodeId} editorAdapterRef={connection} onRevealPosition={reveal} />}
    <DocumentOutlineLayer content={editor.getContent()} contextNodeId={nodeId}
      editorAdapterRef={connection} documentMaxWidth={860} onRevealPosition={reveal}
      onResolveDocumentPositionAtViewportY={() => 0} />
  </>;
  const view = renderWithLocalization(panels());
  const open = () => {
    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    act(() => vi.advanceTimersByTime(120));
  };
  open();
  const floating = () => within(screen.getByRole('navigation', { name: 'Topic outline' }));
  const sidebar = () => within(screen.getByRole('navigation', { name: 'Document outline' }));
  const edit = (from: number, to: number, insert: string) => act(() => editor.replaceRange(from, to, insert));
  const navigate = (name: string) => {
    for (const nav of withSidebar ? [floating(), sidebar()] : [floating()]) {
      fireEvent.click(nav.getByRole('button', { name }));
      expect(reveal).toHaveBeenLastCalledWith(editor.getContent().indexOf(name));
    }
  };
  return { editor, host, view, panels, open, get floating() { return floating(); }, get sidebar() { return sidebar(); }, edit, navigate };
}

it('keeps both outlines current and their own focused rows through continuous edits and duplicate deletion', () => {
  const app = fixture();
  const target = app.floating.getByRole('button', { name: 'Target' });
  target.focus();
  app.edit(8, 8, 'Inserted body\n');
  expect(target).toHaveFocus();
  let from = app.editor.getContent().indexOf('Target');
  app.edit(from, from + 6, 'Renamed');
  expect(app.floating.getByRole('button', { name: 'Renamed' })).toBe(target);
  expect(target).toHaveFocus();
  app.navigate('Renamed');

  const twins = [app.floating, app.sidebar].map(nav => nav.getAllByRole('button', { name: 'Twin' })[1]!);
  twins[0]!.focus();
  from = app.editor.getContent().indexOf('## Twin');
  app.edit(from, from, '## Twin\nInserted duplicate\n');
  expect(twins[0]).toHaveFocus();
  const originalFrom = app.editor.getContent().indexOf('## Twin\nFirst');
  const originalTo = app.editor.getContent().indexOf('## Twin\nSecond');
  app.edit(originalFrom, originalTo, '');
  [app.floating, app.sidebar].forEach((nav, index) => {
    expect(nav.getAllByRole('button', { name: 'Twin' })[1]).toBe(twins[index]);
  });
  expect(twins[0]).toHaveFocus();
  from = app.editor.getContent().indexOf('## Twin\nSecond');
  app.edit(from, app.editor.getContent().indexOf('## Renamed'), '');
  expect(twins[0]).not.toBeInTheDocument();
  app.edit(from, from, '## Twin\nSecond\n');
  expect(app.floating.getAllByRole('button', { name: 'Twin' })[1]).not.toBe(twins[0]);
  app.navigate('Renamed');
});

it('retains proven line moves in both outlines and resets unknown identities on replacement and material switch', () => {
  const app = fixture();
  const targets = [app.floating, app.sidebar].map(nav => nav.getByRole('button', { name: 'Target' }));
  const from = app.editor.getContent().indexOf('Last');
  app.editor.setSelection({ from, to: from });
  targets[0]!.focus();
  act(() => { expect(moveLineUp(EditorView.findFromDOM(app.host)!)).toBe(true); });
  expect(targets[0]).toHaveFocus();
  [app.floating, app.sidebar].forEach((nav, index) => {
    expect(nav.getByRole('button', { name: 'Target' })).toBe(targets[index]);
  });
  app.navigate('Target');
  act(() => app.editor.setContent('# Title\n## Target\nExternal body'));
  targets.forEach(target => expect(target).not.toBeInTheDocument());
  const external = app.floating.getByRole('button', { name: 'Target' });
  external.focus();
  act(() => app.editor.setNodeId('beta'));
  app.view.rerender(app.panels('beta'));
  expect(external).not.toBeInTheDocument();
  expect(app.floating.getByRole('button', { name: 'Target' })).not.toHaveFocus();
  app.navigate('Target');
});

it('keeps a closed floating outline lazy and reopens current content after empty and restored headings', () => {
  const app = fixture(false);
  app.edit(0, app.editor.getContent().length, '# Title');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  app.edit(app.editor.getContent().length, app.editor.getContent().length, '\n## Restored');
  app.navigate('Restored');
  fireEvent.mouseLeave(screen.getByLabelText('Document outline hover zone'));
  const snapshot = vi.spyOn(app.editor.outline, 'getSnapshot');
  snapshot.mockClear();
  app.edit(app.editor.getContent().indexOf('Restored'), app.editor.getContent().length, 'Latest');
  expect(snapshot).not.toHaveBeenCalled();
  app.open();
  expect(screen.getByRole('button', { name: 'Latest' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Restored' })).not.toBeInTheDocument();
});
