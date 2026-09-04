import { fireEvent, render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { PublicCommandProvider } from '../../shared/commands/publicCommandContext';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { FolderListView } from './FolderListView';

beforeEach(() => window.localStorage.clear());

it('runs the forward command from a right gesture on the folder list panel', () => {
  const runCommand = vi.fn();
  const { container } = render(
    <LocalizationProvider>
      <PublicCommandProvider items={[]} runCommand={runCommand}>
        <MouseGestureSettingsProvider>
          <FolderListView mouseGesturesEnabled nodes={[]} nodesById={{}} onSelectNode={() => undefined} />
        </MouseGestureSettingsProvider>
      </PublicCommandProvider>
    </LocalizationProvider>
  );
  const surface = container.querySelector('[data-folder-list-gesture-surface="true"]');
  expect(surface).toBeInstanceOf(HTMLElement);

  fireEvent.mouseDown(surface!, { button: 2, buttons: 2, clientX: 80, clientY: 80 });
  fireEvent.mouseMove(window, { button: 2, buttons: 2, clientX: 120, clientY: 80 });
  fireEvent.mouseUp(window, { button: 2, buttons: 0, clientX: 120, clientY: 80 });

  expect(runCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.goForward);
});
