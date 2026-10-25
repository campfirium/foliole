import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { FlowExitHereContext } from '../../shared/ui/FlowExitHereContext';

import { renderDocumentHeaderActions } from './DocumentPanelHeaderActions';
import { WebLookupSelectionMenu } from './WebLookupSelectionMenu';

function Header() {
  const t = useTranslation();
  return renderDocumentHeaderActions({ canOpenComparisonView: false, editorDisplayMode: 'preview',
    isFolderListView: false, isSourceUpdatePanelOpen: false, onToggleSourceUpdatePanel: vi.fn(),
    showSourceUpdateAction: false, showDocumentControls: true, showPublishActions: false,
    toggleEditorDisplayMode: vi.fn(), t });
}

it('offers exit in place in the desktop right-click menu', () => {
  const close = vi.fn();
  const exit = vi.fn();
  renderWithLocalization(<FlowExitHereContext.Provider value={exit}>
    <WebLookupSelectionMenu left={20} top={20} onClose={close} />
  </FlowExitHereContext.Provider>);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Exit Flow' }));
  expect(close).toHaveBeenCalledOnce();
  expect(exit).toHaveBeenCalledOnce();
});

it('offers the same action in the desktop document overflow', async () => {
  const exit = vi.fn();
  renderWithLocalization(<FlowExitHereContext.Provider value={exit}><Header /></FlowExitHereContext.Provider>);
  await act(async () => fireEvent.keyDown(screen.getByRole('button', { name: 'More editor options' }), { key: 'ArrowDown' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Exit Flow' }));
  expect(exit).toHaveBeenCalledOnce();
});

it('hides the action outside Flow', () => {
  renderWithLocalization(<WebLookupSelectionMenu left={20} top={20} onClose={vi.fn()} />);
  expect(screen.queryByRole('menuitem', { name: 'Exit Flow' })).not.toBeInTheDocument();
});
