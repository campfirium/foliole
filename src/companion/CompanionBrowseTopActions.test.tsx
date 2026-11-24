import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const runtimeState = vi.hoisted(() => ({ supportsNodeWrite: true }));

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  supportsCompanionNodeMutationSurface: (surface: string) => (
    surface === 'quick-capture' && runtimeState.supportsNodeWrite
  )
}));

import {
  getCompanionBrowseShowChildTopics,
  resetCompanionBrowseShowChildTopicsForTests
} from '../shared/platform/companion/settings/companionBrowseChildTopicsStore';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';

beforeEach(() => {
  runtimeState.supportsNodeWrite = true;
});

it('opens sort choices from the browse menu sort row', () => {
  render(
    <CompanionBrowseTopActions
      page={{ kind: 'other' }}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onOpenCapture={vi.fn()}
      sortDirection="desc"
      sortKey="dateLastOpened"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(screen.getByRole('dialog', { name: 'Browse' })).toBeInTheDocument();
  expect(screen.queryByText('Recent -> Older')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Sort\s*Last opened$/ }));
  const sortDialog = screen.getByRole('dialog', { name: 'Sort' });

  expect(within(sortDialog).getByText('Order by')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Recent -> Older')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Older -> Recent')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Sort by')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Date imported')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Date modified')).toBeInTheDocument();
  expect(within(sortDialog).queryByText('Title')).not.toBeInTheDocument();
});

it('keeps Sync out of the browse menu now that the top bar owns it', () => {
  render(
    <CompanionBrowseTopActions
      page={{ kind: 'folder', nodeId: 'folder' }}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onOpenCapture={vi.fn()}
      sortDirection="desc"
      sortKey="dateLastOpened"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /^Sync/ })).not.toBeInTheDocument();
});

it('hides capture when that interaction surface is not accepted', () => {
  runtimeState.supportsNodeWrite = false;
  render(
    <CompanionBrowseTopActions
      page={{ kind: 'other' }}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onOpenCapture={vi.fn()}
      sortDirection="desc"
      sortKey="dateLastOpened"
    />
  );

  expect(screen.queryByRole('button', { name: 'Capture' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
});

it('keeps Appearance out of the browse menu', () => {
  render(<CompanionBrowseTopActions
      page={{ kind: 'other' }}
    onChangeSortDirection={vi.fn()} onChangeSortKey={vi.fn()}
    onOpenCapture={vi.fn()}
    sortDirection="desc" sortKey="dateLastOpened"
  />);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  const menu = screen.getByRole('dialog', { name: 'Browse' });
  expect(within(menu).queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument();
});

it('keeps controls without a target on this page out of the root and trash bars', () => {
  const props = { onChangeSortDirection: vi.fn(), onChangeSortKey: vi.fn(), onOpenCapture: vi.fn(),
    sortDirection: 'desc' as const, sortKey: 'dateLastOpened' as const };
  const view = render(<CompanionBrowseTopActions page={{ kind: 'root' }} {...props} />);
  expect(screen.queryByRole('button', { name: /dismissed|Shelved|Topic focus/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(within(screen.getByRole('dialog', { name: 'Browse' })).queryByRole('button', { name: /^Sort/ })).not.toBeInTheDocument();
  view.unmount();

  render(<CompanionBrowseTopActions page={{ kind: 'trash' }} {...props} />);
  expect(screen.queryByRole('button', { name: 'Capture' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(within(screen.getByRole('dialog', { name: 'Browse' })).getByRole('button', { name: /^Sort/ })).toBeVisible();
});

it('toggles child topics from the Browse list menu only, shown by default', () => {
  resetCompanionBrowseShowChildTopicsForTests();
  const props = { onChangeSortDirection: vi.fn(), onChangeSortKey: vi.fn(), onOpenCapture: vi.fn(),
    sortDirection: 'desc' as const, sortKey: 'dateLastOpened' as const };
  const { unmount } = render(<CompanionBrowseTopActions page={{ kind: 'folder', nodeId: 'folder' }} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Show child topics/ })).not.toBeInTheDocument();
  unmount();

  render(<CompanionBrowseTopActions page={{ kind: 'recent' }} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  const row = within(screen.getByRole('dialog')).getByRole('button', { name: /Show child topics/ });
  expect(row.querySelector('svg')).not.toBeNull();
  fireEvent.click(row);
  expect(getCompanionBrowseShowChildTopics()).toBe(false);
  expect(row.querySelector('svg')).toBeNull();
});
