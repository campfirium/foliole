import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';

import { useFourWayNavigationCommandGate } from './useFourWayNavigationCommandGate';
import { useNativeCommandMenu } from './useNativeCommandMenu';

const { onNativeMenuCommand, syncNativeMenuState } = vi.hoisted(() => ({
  onNativeMenuCommand: vi.fn(),
  syncNativeMenuState: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../shared/platform/commandMenu', () => ({
  onNativeMenuCommand,
  syncNativeMenuState
}));

function TestHarness({ items, onRunCommand }: { items: CommandPaletteItem[]; onRunCommand: (id: string) => void }) {
  useNativeCommandMenu(items, onRunCommand);
  return null;
}

function GuardedTestHarness({ onRunCommand }: { onRunCommand: (id: string) => void }) {
  const guardedRunner = useFourWayNavigationCommandGate({ isCommandSurfaceOpen: false, runCommand: onRunCommand });
  useNativeCommandMenu([
    { enabled: true, id: APP_COMMAND_IDS.goBack, title: 'Go Back' }
  ], guardedRunner);
  return null;
}

describe('useNativeCommandMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs enabled commands and routes native menu events through the shared runner', async () => {
    const onRunCommand = vi.fn();
    onNativeMenuCommand.mockImplementation(async (handler: (commandId: string) => void) => {
      handler(APP_COMMAND_IDS.importSingleFile);
      return () => undefined;
    });

    render(
      <TestHarness
        items={[
          {
            id: APP_COMMAND_IDS.importSingleFile,
            title: 'Import Files',
            section: 'Import',
            enabled: true,
            shortcuts: { primary: { key: 'i', ctrlKey: true } }
          },
          { id: APP_COMMAND_IDS.openTrash, title: 'Trash', section: 'Workspace', enabled: false }
        ]}
        onRunCommand={onRunCommand}
      />
    );

    await waitFor(() => {
      expect(syncNativeMenuState).toHaveBeenCalledWith({
        enabledCommandIds: [APP_COMMAND_IDS.importSingleFile],
        shortcutAccelerators: [{ accelerator: 'Control+I', commandId: APP_COMMAND_IDS.importSingleFile }]
      });
      expect(onRunCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.importSingleFile);
    });
  });

  it('routes native menu navigation through the shared composition guard', async () => {
    const onRunCommand = vi.fn();
    let nativeHandler: ((commandId: string) => void) | null = null;
    onNativeMenuCommand.mockImplementation(async (handler: (commandId: string) => void) => {
      nativeHandler = handler;
      return () => undefined;
    });
    render(<GuardedTestHarness onRunCommand={onRunCommand} />);
    await waitFor(() => expect(nativeHandler).not.toBeNull());

    act(() => window.dispatchEvent(new CompositionEvent('compositionstart')));
    act(() => nativeHandler?.(APP_COMMAND_IDS.goBack));
    expect(onRunCommand).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(new CompositionEvent('compositionend')));
    act(() => nativeHandler?.(APP_COMMAND_IDS.goBack));
    expect(onRunCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.goBack);
  });
});
