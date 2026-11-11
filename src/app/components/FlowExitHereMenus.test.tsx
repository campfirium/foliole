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

it('keeps article actions available without offering to exit Flow in the right-click menu', () => {
  renderWithLocalization(<FlowExitHereContext.Provider value={vi.fn()}>
    <WebLookupSelectionMenu left={20} top={20} onClose={vi.fn()} onConfigureFormatCleanup={vi.fn()} />
  </FlowExitHereContext.Provider>);
  expect(screen.getByRole('menuitem', { name: 'Clean formatting...' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Exit Flow' })).not.toBeInTheDocument();
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
