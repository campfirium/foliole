import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { renderDocumentHeaderActions } from './DocumentPanelHeaderActions';

function PublishHeaderActions(props: {
  onRunDocumentCommand?: ((commandId: string) => void) | undefined;
  showPublishActions: boolean;
}) {
  const t = useTranslation();
  return renderDocumentHeaderActions({
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
  });
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
  expect(screen.getByRole('separator')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: 'Publish to WordPress' }));
  expect(onRunDocumentCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.publishToWordPress);
});

it('keeps publishing commands out of non-publishable document menus', async () => {
  renderWithLocalization(<PublishHeaderActions showPublishActions={false} />);

  await openDocumentActionsMenu();

  expect(screen.queryByRole('menuitem', { name: 'Publish to the site' })).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Compare with Draft' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Switch to Source mode' })).toBeInTheDocument();
});
