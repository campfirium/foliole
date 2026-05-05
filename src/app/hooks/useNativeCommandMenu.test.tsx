import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';

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
          { id: APP_COMMAND_IDS.importSingleFile, title: 'Import Files', section: 'Import', enabled: true },
          { id: APP_COMMAND_IDS.openTrash, title: 'Trash', section: 'Workspace', enabled: false }
        ]}
        onRunCommand={onRunCommand}
      />
    );

    await waitFor(() => {
      expect(syncNativeMenuState).toHaveBeenCalledWith([APP_COMMAND_IDS.importSingleFile]);
      expect(onRunCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.importSingleFile);
    });
  });
});
