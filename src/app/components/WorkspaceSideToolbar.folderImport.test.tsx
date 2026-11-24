import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createBrowserDemoRuntimeController } from '../../demo/demoRuntimeController';
import { resetDemoWorkspaceSnapshot } from '../../demo/demoWorkspaceReset';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { AppearanceSettingsProvider } from '../../features/settings/context/AppearanceSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../../features/settings/context/WorkspaceRailSettingsProvider';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { installDemoRuntimeController } from '../../shared/platform/runtime/demoRuntime';
import { runDemoCommandPreview } from '../hooks/appPaletteDemoCommand';

import { requestFileImport } from './importActivityRequests';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function directoryFile(path: string, text: string) {
  const file = new File([text], path.split('/').at(-1)!);
  Object.defineProperties(file, { webkitRelativePath: { value: path }, text: { value: async () => text } });
  return file;
}

it('opens a directory from Import Folder and preserves paths when importing into the Demo Inbox', async () => {
  resetDemoWorkspaceSnapshot('/en/demo/');
  const controller = createBrowserDemoRuntimeController();
  installDemoRuntimeController(controller);
  const { container } = renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>
        <WorkspaceSideToolbar canStartStudyMode isSettingsOpen={false} isStudyMode={false} onOpenSettings={vi.fn()}
          onStartClipboardImport={vi.fn()} onStartImport={vi.fn()} onToggleReviewSession={vi.fn()} />
      </WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
  const translate: Translate = key => key;

  expect(runDemoCommandPreview(APP_COMMAND_IDS.importFolder, translate)).toBe(true);
  expect(click).toHaveBeenCalledOnce();
  expect(input).toHaveAttribute('webkitdirectory');
  fireEvent.change(input, { target: { files: [
    directoryFile('Vault/Area/Nested/notes.md', '# Deep note\n\nDeep text'),
    directoryFile('Vault/Other/notes.txt', 'Other text'),
    directoryFile('Vault/.hidden/secret.md', '# Ignored hidden note'),
    directoryFile('Vault/ignored.png', 'Ignored image')
  ] } });

  await waitFor(() => expect(controller.getState().importedTopicCount).toBe(2));
  const { state } = JSON.parse(window.localStorage.getItem('foliole-workspace-v1')!);
  const nodes = state.nodesById;
  const imported = nodes[nodes[INBOX_NODE_ID].manualChildOrder.at(-1)];
  expect(imported.title).toBe('Imported Markdown');
  const vault = nodes[imported.manualChildOrder[0]];
  expect(vault.title).toBe('Vault');
  const [area, other] = vault.manualChildOrder.map((id: string) => nodes[id]);
  expect(area.title).toBe('Area');
  expect(other.title).toBe('Other');
  const nested = nodes[area.manualChildOrder[0]];
  expect(nested.title).toBe('Nested');
  expect(nodes[nested.manualChildOrder[0]]).toMatchObject({ title: 'Deep note', content: '# Deep note\n\nDeep text' });
  expect(nodes[other.manualChildOrder[0]]).toMatchObject({ title: 'notes', content: 'Other text' });

  requestFileImport();
  expect(click).toHaveBeenCalledTimes(2);
  expect(input).not.toHaveAttribute('webkitdirectory');
});
