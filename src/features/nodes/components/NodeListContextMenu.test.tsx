import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../../lib/core/nodes/folderTopicItemCommands';

import { NodeListContextMenu } from './NodeListContextMenu';

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

it('groups node context menu actions into create, edit, review, and destructive order', () => {
  render(<NodeListContextMenu {...noopProps()} />);

  const labels = within(screen.getByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent);

  expect(labels).toEqual([
    'Create Topic',
    'Create Item',
    'Rename',
    'Merge Highlights',
    'Paste here',
    'Move to…',
    'Relearn',
    'Review options…',
    'Dismiss',
    'Shelve entire topic',
    'Dismiss Entire Topic',
    'Delete'
  ]);
});

it('renders compact icon menu items and keeps delete visually destructive', () => {
  render(<NodeListContextMenu {...noopProps()} />);

  const menu = screen.getByRole('menu');
  expect(within(menu).getAllByRole('separator')).toHaveLength(4);
  expect(screen.getByRole('menuitem', { name: 'Rename' }).querySelector('svg')).not.toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toContain('text-error/90');
});
