import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DocumentHeaderMenuSettingsContext } from '../../features/settings/context/documentHeaderMenuSettingsContext';
import { DEFAULT_DOCUMENT_HEADER_MENU_ITEMS } from '../../features/settings/model/documentHeaderMenuSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { renderDocumentHeaderActions } from './DocumentPanelHeaderActions';

function defaultMenuItem(commandId: string) {
  const item = DEFAULT_DOCUMENT_HEADER_MENU_ITEMS.find((candidate) => candidate.commandId === commandId);
  if (!item) throw new Error(`missing default menu item: ${commandId}`);
  return item;
}

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
        onToggleMenuItem: vi.fn(),
        onToggleMenuSeparator: vi.fn()
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

it('exposes every publishing command from the editor menu', async () => {
  const onRunDocumentCommand = vi.fn();
  renderWithLocalization(
    <PublishHeaderActions onRunDocumentCommand={onRunDocumentCommand} showPublishActions />
  );

  await openDocumentActionsMenu();

  expect(screen.getByRole('menuitem', { name: 'Compare with Draft' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Publish to the site' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Publish to WordPress' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Publish to Discourse' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Split Topic' })).toBeInTheDocument();
  expect(screen.queryByRole('separator')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: 'Publish to WordPress' }));
  expect(onRunDocumentCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.publishToWordPress);
});

it('renders configured editor menu separators', async () => {
  renderWithLocalization(
    <PublishHeaderActions
      menuItems={DEFAULT_DOCUMENT_HEADER_MENU_ITEMS.map((item) =>
        item.commandId === APP_COMMAND_IDS.publishToWordPress ? { ...item, separatorBefore: true } : item
      )}
      showPublishActions
    />
  );

  await openDocumentActionsMenu();

  expect(screen.getAllByRole('separator')).toHaveLength(1);
});

it('keeps separators stable when hidden commands are between visible commands', async () => {
  renderWithLocalization(
    <PublishHeaderActions
      menuItems={DEFAULT_DOCUMENT_HEADER_MENU_ITEMS.map((item) => {
        if (item.commandId === APP_COMMAND_IDS.publishToWordPress) {
          return { ...item, separatorBefore: true, visible: false };
        }
        return item;
      })}
      showPublishActions
    />
  );

  await openDocumentActionsMenu();

  expect(screen.queryByRole('menuitem', { name: 'Publish to WordPress' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('separator')).toHaveLength(1);
});

it('applies configured editor menu order and hidden commands', async () => {
  renderWithLocalization(
    <PublishHeaderActions
      menuItems={[
        { ...defaultMenuItem(APP_COMMAND_IDS.toggleComparisonView), order: 0 },
        { ...DEFAULT_DOCUMENT_HEADER_MENU_ITEMS[0]!, order: 1, visible: false },
        { ...defaultMenuItem(APP_COMMAND_IDS.toggleEditorDisplayMode), order: 2 }
      ]}
      showPublishActions
    />
  );

  await openDocumentActionsMenu();

  expect(screen.queryByRole('menuitem', { name: 'Publish to the site' })).not.toBeInTheDocument();
  const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
  expect(items.slice(0, 2)).toEqual(['Compare with Draft', 'Switch to Source mode']);
});

it('opens editor menu customization from the menu', async () => {
  const onRunDocumentCommand = vi.fn();
  renderWithLocalization(
    <PublishHeaderActions onRunDocumentCommand={onRunDocumentCommand} showPublishActions={false} />
  );

  await openDocumentActionsMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Customize menu...' }));

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory)).toBe('document-menu');
  expect(onRunDocumentCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.openSettings);
});

it('allows the editor menu customization command to be hidden', async () => {
  renderWithLocalization(
    <PublishHeaderActions
      menuItems={DEFAULT_DOCUMENT_HEADER_MENU_ITEMS.map((item) =>
        item.commandId === APP_COMMAND_IDS.customizeDocumentMenu ? { ...item, visible: false } : item
      )}
      showPublishActions={false}
    />
  );

  await openDocumentActionsMenu();

  expect(screen.queryByRole('menuitem', { name: 'Customize menu...' })).not.toBeInTheDocument();
});

it('keeps publishing commands out of non-publishable document menus', async () => {
  renderWithLocalization(<PublishHeaderActions showPublishActions={false} />);

  await openDocumentActionsMenu();

  expect(screen.queryByRole('menuitem', { name: 'Publish to the site' })).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Split Topic' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Compare with Draft' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Switch to Source mode' })).toBeInTheDocument();
});
