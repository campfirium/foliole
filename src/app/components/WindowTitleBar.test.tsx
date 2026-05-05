import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const closeMainWindow = vi.fn().mockResolvedValue(undefined);
const minimizeMainWindow = vi.fn().mockResolvedValue(undefined);
const queryMainWindowMaximized = vi.fn().mockResolvedValue(false);
const toggleMainWindowMaximize = vi.fn().mockResolvedValue(undefined);
const onMainWindowResized = vi.fn().mockResolvedValue(() => undefined);

vi.mock('../../shared/platform/windowControls', () => ({
  closeMainWindow: () => closeMainWindow(),
  isWindowControlsAvailable: () => true,
  minimizeMainWindow: () => minimizeMainWindow(),
  onMainWindowResized: (handler: () => void) => onMainWindowResized(handler),
  queryMainWindowMaximized: () => queryMainWindowMaximized(),
  toggleMainWindowMaximize: () => toggleMainWindowMaximize()
}));

import { WindowTitleBar } from './WindowTitleBar';

describe('WindowTitleBar', () => {
  beforeEach(() => {
    closeMainWindow.mockClear();
    minimizeMainWindow.mockClear();
    queryMainWindowMaximized.mockClear();
    toggleMainWindowMaximize.mockClear();
    onMainWindowResized.mockClear();
  });

  it('triggers desktop window controls from titlebar buttons', () => {
    const { container } = render(
      <WindowTitleBar
        isListHidden={false}
        isTrashViewOpen={false}
        listWidth={320}
        onOpenNotesView={() => undefined}
        onOpenTrashView={() => undefined}
        onToggleListVisibility={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const dragFill = container.querySelector('.window-titlebar-drag-fill');
    if (!dragFill) {
      throw new Error('window-titlebar-drag-fill should exist');
    }
    fireEvent.doubleClick(dragFill);

    expect(minimizeMainWindow).toHaveBeenCalledTimes(1);
    expect(toggleMainWindowMaximize).toHaveBeenCalledTimes(2);
    expect(closeMainWindow).toHaveBeenCalledTimes(1);
  });
});
