import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../../lib/core/nodes/folderTopicItemCommands';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../shared/localization/testLocalization';

import { NodeListContextMenu } from './NodeListContextMenu';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function noopProps() {
  return {
    createCommands: FOLDER_TOPIC_ITEM_COMMANDS.slice(1),
    isTrashMenu: false,
    left: 24,
    onClose: vi.fn(),
    onCreateCommand: vi.fn(),
    onDeleteNode: vi.fn(),
    onDeleteNodePermanently: vi.fn(),
    onDismissEntireTopic: vi.fn(),
    onDismissNode: vi.fn(),
    onMergeHighlightsIntoTopic: vi.fn(),
    onMoveToNode: vi.fn(),
    onOpenReviewScheduling: vi.fn(),
    onPasteIntoNode: vi.fn(),
    onRenameNode: vi.fn(),
    onReturnNode: vi.fn(),
    onRestoreNode: vi.fn(),
    onShelveTopic: vi.fn(),
    onToggleSequentialReading: vi.fn(),
    onUnshelveTopic: vi.fn(),
    showDeleteAction: true,
    showDismissAction: true,
    showDismissEntireTopicAction: true,
    showMergeHighlightsIntoTopicAction: true,
    showMoveToNodeAction: true,
    showPasteIntoNodeAction: true,
    showRenameAction: true,
    showReturnAction: true,
    showShelveTopicAction: true,
    showReviewSchedulingAction: true,
    top: 32
  };
}

it('groups node context actions into create, edit, review, and destructive order', () => {
  renderWithLocalization(<NodeListContextMenu {...noopProps()} />);

  const labels = within(screen.getByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent);

  expect(labels).toEqual([
    'Create Topic',
    'Create Item',
    'Rename',
    'Merge highlights',
    'Paste as Topic',
    'Move to…',
    'Relearn',
    'Review options…',
    'Dismiss',
    'Shelve entire topic',
    'Dismiss topic',
    'Delete'
  ]);
});

it('renders compact icon menu items and keeps delete visually destructive', () => {
  renderWithLocalization(<NodeListContextMenu {...noopProps()} />);

  const menu = screen.getByRole('menu');
  expect(within(menu).getAllByRole('separator')).toHaveLength(4);
  expect(screen.getByRole('menuitem', { name: 'Rename' }).querySelector('svg')).not.toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toContain('text-error/90');
});

it('does not render a leading separator when create actions are hidden', () => {
  renderWithLocalization(
    <NodeListContextMenu
      {...noopProps()}
      createCommands={[]}
      showDismissAction={false}
      showDismissEntireTopicAction={false}
      showMergeHighlightsIntoTopicAction={false}
      showMoveToNodeAction={false}
      showPasteIntoNodeAction={false}
      showShelveTopicAction={false}
    />
  );

  const menu = screen.getByRole('menu');
  expect(menu.firstElementChild).toHaveAttribute('role', 'menuitem');
  expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
    'Rename',
    'Relearn',
    'Review options…',
    'Delete'
  ]);
});

it('shows Relearn help after a long hover', () => {
  vi.useFakeTimers();
  renderWithLocalization(<NodeListContextMenu {...noopProps()} />);

  const relearn = screen.getByRole('menuitem', { name: 'Relearn' });
  fireEvent.pointerMove(relearn, { pointerType: 'mouse' });
  fireEvent.pointerEnter(relearn, { pointerType: 'mouse' });

  act(() => {
    vi.advanceTimersByTime(999);
  });
  expect(screen.queryByRole('tooltip')).toBeNull();

  act(() => {
    vi.advanceTimersByTime(1);
  });
  const helpCard = screen.getByRole('tooltip');
  expect(helpCard).toHaveTextContent('Relearn');
  expect(helpCard).toHaveTextContent("Clear this topic's learning progress.");
  expect(helpCard).toHaveTextContent('It can be studied again from the beginning.');
});

it('shows action help for complex topic menu actions', () => {
  vi.useFakeTimers();
  renderWithLocalization(<NodeListContextMenu {...noopProps()} />);

  const shelve = screen.getByRole('menuitem', { name: 'Shelve entire topic' });
  fireEvent.pointerEnter(shelve, { pointerType: 'mouse' });

  act(() => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByRole('tooltip')).toHaveTextContent('Shelve entire topic');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Set this topic and its derived topics aside.');
});

it('does not show action help when the setting is off', () => {
  vi.useFakeTimers();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.actionHelpCardsEnabled, 'false');
  renderWithLocalization(<NodeListContextMenu {...noopProps()} />);

  const relearn = screen.getByRole('menuitem', { name: 'Relearn' });
  fireEvent.pointerMove(relearn, { pointerType: 'mouse' });
  fireEvent.pointerEnter(relearn, { pointerType: 'mouse' });

  act(() => {
    vi.advanceTimersByTime(1200);
  });
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('does not show action help for actions without help copy', () => {
  vi.useFakeTimers();
  renderWithLocalization(<NodeListContextMenu {...noopProps()} />);

  const rename = screen.getByRole('menuitem', { name: 'Rename' });
  fireEvent.pointerMove(rename, { pointerType: 'mouse' });
  fireEvent.pointerEnter(rename, { pointerType: 'mouse' });

  act(() => {
    vi.advanceTimersByTime(1200);
  });
  expect(screen.queryByRole('tooltip')).toBeNull();
});
