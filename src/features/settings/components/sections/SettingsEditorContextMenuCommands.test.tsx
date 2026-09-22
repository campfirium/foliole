import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { settingsDesktopAdapters } from '../../../../app/components/settingsDesktopAdapters';
import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { DocumentHeaderMenuSettingsProvider } from '../../context/DocumentHeaderMenuSettingsProvider';

import { SettingsEditorContextMenuCommands } from './SettingsEditorContextMenuCommands';

beforeEach(() => window.localStorage.clear());

it('adds an existing command to the editor right-click menu without changing the editor header menu', () => {
  renderWithLocalization(
    <DocumentHeaderMenuSettingsProvider>
      <SettingsEditorContextMenuCommands
        actionItems={[{
          commandId: APP_COMMAND_IDS.findInTopic,
          isCustomized: false,
          primaryShortcutLabel: '',
          secondaryShortcutLabel: '',
          shortcutSummaryLabel: '',
          title: 'Find in Topic'
        }]}
        resolveDocumentMenuLabel={settingsDesktopAdapters.resolveDocumentMenuLabel}
      />
    </DocumentHeaderMenuSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
  fireEvent.click(screen.getByRole('button', { name: /Find in Topic/ }));

  expect(screen.getByText('Find in Topic')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.editorContextMenuItems)).toContain(APP_COMMAND_IDS.findInTopic);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.documentHeaderMenuItems)).toBeNull();
});
