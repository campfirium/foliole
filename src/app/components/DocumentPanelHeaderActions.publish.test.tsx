import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DocumentHeaderMenuSettingsContext } from '../../features/settings/context/documentHeaderMenuSettingsContext';
import { DEFAULT_DOCUMENT_HEADER_MENU_ITEMS } from '../../features/settings/model/documentHeaderMenuSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { renderDocumentHeaderActions } from './DocumentPanelHeaderActions';

function PublishHeaderActions(props: {
  menuItems?: typeof DEFAULT_DOCUMENT_HEADER_MENU_ITEMS;
  onRunDocumentCommand?: ((commandId: string) => void) | undefined;
  showPublishActions: boolean;
}) {
  const t = useTranslation();
  return (
    <DocumentHeaderMenuSettingsContext.Provider
      value={{
        items: props.menuItems ?? DEFAULT_DOCUMENT_HEADER_MENU_ITEMS,
        onAddMenuItem: vi.fn(),
        onMoveMenuItem: vi.fn(),
        onRemoveMenuItem: vi.fn(),
        onResetMenu: vi.fn(),
        onToggleMenuItem: vi.fn()
      }}
    >
      {renderDocumentHeaderActions({
    canOpenComparisonView: true,
    editorDisplayMode: 'preview',
    isFolderListView: false,
    isSourceUpdatePanelOpen: false,
    onRunDocumentCommand: props.onRunDocumentCommand,
    onToggleSourceUpdatePanel: vi.fn(),
    showDocumentControls: true,
    showPublishActions: props.showPublishActions,
    showSourceUpdateAction: false,
    t,
    toggleEditorDisplayMode: vi.fn()
      })}
    </DocumentHeaderMenuSettingsContext.Provider>
  );
}

async function openDocumentActionsMenu() {
  await act(async () => {
    const trigger = screen.getByRole('button', { name: 'More editor options' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  });
}

it('exposes every publishing command from the Topic actions menu', async () => {
  const onRunDocumentCommand = vi.fn();
  renderWithLocalization(
    <PublishHeaderActions onRunDocumentCommand={onRunDocumentCommand} showPublishActions />
  );

  await openDocumentActionsMenu();

  expect(screen.getByRole('menuitem', { name: 'Compare with Draft' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Publish to the site' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Publish to WordPress' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Publish to Discourse' })).toBeInTheDocument();
  expect(screen.getAllByRole('separator').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('menuitem', { name: 'Publish to WordPress' }));
  expect(onRunDocumentCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.publishToWordPress);
});

it('applies configured Topic menu order and hidden commands', async () => {
  renderWithLocalization(
    <PublishHeaderActions
      menuItems={[
        { ...DEFAULT_DOCUMENT_HEADER_MENU_ITEMS[3]!, order: 0 },
        { ...DEFAULT_DOCUMENT_HEADER_MENU_ITEMS[0]!, order: 1, visible: false },
        { ...DEFAULT_DOCUMENT_HEADER_MENU_ITEMS[4]!, order: 2 }
      ]}
      showPublishActions
    />
  );

  await openDocumentActionsMenu();

  expect(screen.queryByRole('menuitem', { name: 'Publish to the site' })).not.toBeInTheDocument();
  const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
  expect(items.slice(0, 2)).toEqual(['Compare with Draft', 'Switch to Source mode']);
});

it('opens Topic menu customization from the menu', async () => {
  const onRunDocumentCommand = vi.fn();
  renderWithLocalization(
    <PublishHeaderActions onRunDocumentCommand={onRunDocumentCommand} showPublishActions={false} />
  );

  await openDocumentActionsMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Customize menu...' }));

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory)).toBe('document-menu');
  expect(onRunDocumentCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.openSettings);
});

it('keeps publishing commands out of non-publishable document menus', async () => {
  renderWithLocalization(<PublishHeaderActions showPublishActions={false} />);

  await openDocumentActionsMenu();

  expect(screen.queryByRole('menuitem', { name: 'Publish to the site' })).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Compare with Draft' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Switch to Source mode' })).toBeInTheDocument();
});
