import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { setSystemEntryDisplayNames } from '../shared/localization/systemEntryDisplayNamesStore';

import { CompanionDirectoryList } from './CompanionDirectoryListSurface';

afterEach(() => {
  cleanup();
  setSystemEntryDisplayNames({ customDisplayNameById: {}, version: 1 });
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
  fireEvent.click(screen.getByRole('button', { name: 'More: A topic' }));
  expect(select).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
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

  expect(screen.getByRole('button', { name: '打开文件夹 收件箱' })).toHaveTextContent('新主题默认进入这里');
  expect(screen.getByRole('button', { name: '打开文件夹 todo' })).not.toHaveTextContent('文件夹');
  expect(screen.queryByText('空主题')).not.toBeInTheDocument();
});
