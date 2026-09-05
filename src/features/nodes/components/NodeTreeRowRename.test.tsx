import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { commitActiveNodeRename } from './nodeRenameCommitCapability';
import { NodeTreeRow } from './NodeTreeRow';
import { requestNodeRename } from './NodeTreeRowRename';

function renderRow(onRename = vi.fn(async () => true)) {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive
      isCollapsed={false}
      isSelected
      label="Draft topic"
      nodeId="node-1"
      onRename={onRename}
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );
  return screen.getByRole('treeitem', { name: 'Draft topic' });
}

function beginRequestedRename(focusBody = vi.fn()) {
  act(() => {
    requestNodeRename('node-1', focusBody);
  });
  return { focusBody, input: screen.getByRole('textbox', { name: 'Rename Draft topic' }) };
}

it('selects the complete existing title when requested', async () => {
  renderRow();
  const { input } = beginRequestedRename();

  await waitFor(() => {
    expect(input).toHaveFocus();
    expect(input).toHaveProperty('selectionStart', 0);
    expect(input).toHaveProperty('selectionEnd', 'Draft topic'.length);
  });
});

it('disables row dragging while the title is being edited', () => {
  const row = renderRow();
  const frame = row.parentElement;
  expect(frame).toHaveAttribute('draggable', 'true');

  const { input } = beginRequestedRename();

  expect(frame).toHaveAttribute('draggable', 'false');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(frame).toHaveAttribute('draggable', 'true');
});

it('submits once with Tab and focuses the body only after success', async () => {
  let finishRename: (succeeded: boolean) => void = () => undefined;
  const onRename = vi.fn(() => new Promise<boolean>((resolve) => {
    finishRename = resolve;
  }));
  renderRow(onRename);
  const { focusBody, input } = beginRequestedRename();
  fireEvent.change(input, { target: { value: 'Renamed topic' } });

  fireEvent.keyDown(input, { key: 'Tab' });
  fireEvent.blur(input);

  expect(onRename).toHaveBeenCalledOnce();
  expect(focusBody).not.toHaveBeenCalled();
  await act(async () => finishRename(true));
  await waitFor(() => expect(focusBody).toHaveBeenCalledOnce());
  expect(onRename).toHaveBeenCalledOnce();
});

it('submits with Enter and restores the tree origin', async () => {
  const onRename = vi.fn(async () => true);
  const row = renderRow(onRename);
  row.focus();
  const { focusBody, input } = beginRequestedRename();
  fireEvent.change(input, { target: { value: 'Renamed topic' } });

  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(row).toHaveFocus());
  expect(onRename).toHaveBeenCalledOnce();
  expect(focusBody).not.toHaveBeenCalled();
});

it('cancels with Escape and restores the tree origin without submitting', async () => {
  const onRename = vi.fn(async () => true);
  const row = renderRow(onRename);
  row.focus();
  const { input } = beginRequestedRename();
  fireEvent.change(input, { target: { value: 'Changed topic' } });

  fireEvent.keyDown(input, { key: 'Escape' });
  await commitActiveNodeRename();
  fireEvent.blur(input);

  await waitFor(() => expect(row).toHaveFocus());
  expect(screen.getByRole('treeitem', { name: 'Draft topic' })).toBeInTheDocument();
  expect(onRename).not.toHaveBeenCalled();
});

it('keeps the draft and input focus when an async rename fails', async () => {
  const onRename = vi.fn(async () => false);
  renderRow(onRename);
  const { focusBody, input } = beginRequestedRename();
  fireEvent.change(input, { target: { value: 'Unsaved draft' } });

  fireEvent.keyDown(input, { key: 'Tab' });

  await waitFor(() => expect(input).toHaveFocus());
  expect(input).toHaveValue('Unsaved draft');
  expect(focusBody).not.toHaveBeenCalled();
  expect(onRename).toHaveBeenCalledOnce();
});
