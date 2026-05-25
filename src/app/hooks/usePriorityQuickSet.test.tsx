import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { onWindowEscape } from '../../shared/platform/keyboard';

import { usePriorityQuickSet } from './usePriorityQuickSet';

function Harness({
  activeNodeId = 'node-1',
  blocked = false,
  onPriorityChange = vi.fn()
}: {
  activeNodeId?: string | null;
  blocked?: boolean;
  onPriorityChange?: (nodeId: string, priority: number) => void;
}) {
  const state = usePriorityQuickSet({
    activeNodeId,
    blocked,
    onPriorityChange,
    shortcuts: { primary: { key: 'm', ctrlKey: true } }
  });

  return (
    <div>
      <button onClick={() => state.enter()} type="button">
        enter
      </button>
      <span>{state.isActive ? 'active' : 'idle'}</span>
      <span>{state.shortcutLabel}</span>
    </div>
  );
}

it('enters quick-set mode from the configured shortcut and applies a digit', () => {
  const onPriorityChange = vi.fn();

  render(<Harness onPriorityChange={onPriorityChange} />);

  fireEvent.keyDown(window, { key: 'm', ctrlKey: true });
  expect(screen.getByText('active')).toBeInTheDocument();

  fireEvent.keyDown(window, { key: '0' });

  expect(onPriorityChange).toHaveBeenCalledWith('node-1', 0);
  expect(screen.getByText('idle')).toBeInTheDocument();
  expect(screen.getByText('Ctrl+M')).toBeInTheDocument();
});

it('cancels quick-set mode with escape', () => {
  render(<Harness />);

  fireEvent.click(screen.getByRole('button', { name: 'enter' }));
  expect(screen.getByText('active')).toBeInTheDocument();

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(screen.getByText('idle')).toBeInTheDocument();
});

it('keeps escape inside quick-set mode before older escape handlers', () => {
  const outerEscape = vi.fn();
  const unlistenOuterEscape = onWindowEscape(outerEscape);

  render(<Harness />);

  fireEvent.click(screen.getByRole('button', { name: 'enter' }));
  expect(screen.getByText('active')).toBeInTheDocument();

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(screen.getByText('idle')).toBeInTheDocument();
  expect(outerEscape).not.toHaveBeenCalled();

  unlistenOuterEscape();
});
