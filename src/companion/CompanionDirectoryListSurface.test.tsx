import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { setSystemEntryDisplayNames } from '../shared/localization/systemEntryDisplayNamesStore';
import * as runtime from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionDirectoryList } from './CompanionDirectoryListSurface';
import * as workspaceActions from './CompanionWorkspaceActions';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setSystemEntryDisplayNames({ customDisplayNameById: {}, version: 1 });
});

it('shows an empty folder as one short centered line without filler copy', () => {
  render(<CompanionDirectoryList
    directory={{} as never}
    emptyLabel="No topics or folders"
    onSelectItem={vi.fn()}
    sections={[{ id: 'current', items: [] }]}
    snapshot={null}
  />);

  const status = screen.getByRole('status');
  expect(status).toHaveTextContent(/^No topics or folders$/);
  expect(status).not.toHaveClass('items-start');
  expect(status.querySelector('svg, img, [role="img"]')).toBeNull();
});

it('uses the shared custom Home name instead of a fixed Workspace section', () => {
  setSystemEntryDisplayNames({ customDisplayNameById: { home: '我的 Home' }, version: 1 });
  render(
    <LocalizationProvider initialLanguagePreference="zh-Hans">
      <CompanionDirectoryList
        directory={{} as never}
        emptyLabel=""
        onSelectItem={vi.fn()}
        sections={[{ id: 'home', items: [] }]}
        snapshot={null}
      />
    </LocalizationProvider>
  );

  expect(screen.getByRole('heading', { name: '我的 Home' })).toBeInTheDocument();
  expect(screen.queryByText('工作区')).not.toBeInTheDocument();
});


it('uses article actions and preserves availability feedback inside folders', () => {
  const select = vi.fn();
  render(<CompanionDirectoryList
    directory={{} as never}
    emptyLabel=""
    onSelectItem={select}
    sections={[{ id: 'current', items: [{ id: 'topic', nodeId: 'topic', kind: 'topic', source: 'internal', title: 'A topic', preview: 'Opening text', bodyStatus: 'failed' }] }]}
    snapshot={null}
  />);
  const row = screen.getByRole('button', { name: 'Open topic A topic' });
  expect(row).toHaveTextContent('Opening text');
  expect(row).toHaveTextContent('Topic body unavailable');
  expect(screen.queryByRole('button', { name: 'More: A topic' })).toBeNull();
});

it('does not present a folder body status or repeat its type in the directory', () => {
  render(<LocalizationProvider initialLanguagePreference="zh-Hans">
    <CompanionDirectoryList
      directory={{ entries: [] } as never}
      emptyLabel=""
      onSelectItem={vi.fn()}
      sections={[{ id: 'home', items: [
        { id: 'inbox', nodeId: 'special-inbox', kind: 'folder', source: 'internal', title: 'Inbox', preview: null, bodyStatus: 'empty' },
        { id: 'folder', nodeId: 'folder', kind: 'folder', source: 'internal', title: 'todo', preview: null, bodyStatus: 'empty' }
      ] }]}
      snapshot={null}
    />
  </LocalizationProvider>);

  expect(screen.getByRole('button', { name: '打开文件夹 收件箱' })).not.toHaveTextContent('新主题默认进入这里');
  expect(screen.getByRole('button', { name: '打开文件夹 todo' })).not.toHaveTextContent('文件夹');
  expect(screen.queryByText('空主题')).not.toBeInTheDocument();
});

it('opens folder actions on a hold and keeps ordinary clicks for navigation', async () => {
  vi.spyOn(runtime, 'isAvailableNativeCompanionRuntime').mockReturnValue(true);
  vi.spyOn(workspaceActions, 'useCompanionWorkspaceActions').mockReturnValue({
    snapshot: { nodesById: { folder: { id: 'folder', kind: 'folder', parentNodeId: null } } }
  } as never);
  vi.useFakeTimers();
  try {
    const select = vi.fn();
    render(<CompanionDirectoryList directory={{ entries: [] } as never} emptyLabel=""
      onSelectItem={select} sections={[{ id: 'current', items: [
        { id: 'folder', nodeId: 'folder', kind: 'folder', source: 'internal', title: 'Projects', preview: null }
      ] }]} snapshot={null} />);
    const row = screen.getByRole('button', { name: 'Open folder Projects' });
    expect(screen.queryByRole('button', { name: 'More: Projects' })).toBeNull();
    const pointer = { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 10, clientY: 10 };
    const press = () => fireEvent.pointerDown(row, pointer);
    press();
    fireEvent.pointerUp(row, pointer);
    expect(fireEvent.touchEnd(row)).toBe(true);
    fireEvent.click(row, { detail: 1 });
    expect(select).toHaveBeenCalledTimes(1);

    press();
    fireEvent.pointerMove(row, { ...pointer, clientY: 30 });
    await act(async () => { await vi.advanceTimersByTimeAsync(550); });
    expect(screen.queryByRole('dialog')).toBeNull();

    press();
    fireEvent.pointerCancel(row, pointer);
    await act(async () => { await vi.advanceTimersByTimeAsync(550); });
    expect(screen.queryByRole('dialog')).toBeNull();

    press();
    await act(async () => { await vi.advanceTimersByTimeAsync(550); });
    expect(screen.getByRole('dialog', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    fireEvent.pointerUp(row, pointer);
    expect(fireEvent.touchEnd(row)).toBe(false);
    fireEvent.click(row, { detail: 1 });
    expect(select).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it('names a topic\'s folder only when the list is not that folder itself', () => {
  const node = (id: string, title: string, kind: 'folder' | 'topic', parentNodeId: string | null) => ({
    id, title, parentNodeId, kind, content: '', isTitleManual: true, hideTitleHeading: false,
    reveal: null, anchorLink: null, reading: null, review: null, createdAt: '2026-11-09', updatedAt: '2026-11-09'
  });
  const snapshot = {
    nodesById: {
      projects: node('projects', 'Sample Projects', 'folder', null),
      topic: node('topic', 'Field notes', 'topic', 'projects')
    },
    nodeOrder: ['projects'], trashedNodeIds: [], activeNodeId: null, untitledSequenceByParent: {}
  } as never;
  const list = (containerNodeId?: string) => <CompanionDirectoryList
    containerNodeId={containerNodeId}
    directory={{} as never}
    emptyLabel=""
    onSelectItem={vi.fn()}
    sections={[{ id: 'current', items: [{ id: 'topic', nodeId: 'topic', kind: 'topic', source: 'internal', title: 'Field notes', preview: null }] }]}
    snapshot={snapshot}
  />;

  const view = render(list('projects'));
  expect(screen.getByRole('button', { name: 'Open topic Field notes' })).not.toHaveTextContent('Sample Projects');
  view.rerender(list());
  expect(screen.getByRole('button', { name: 'Open topic Field notes' })).toHaveTextContent('Sample Projects');
});
