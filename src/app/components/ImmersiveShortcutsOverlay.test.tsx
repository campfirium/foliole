import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { CommandShortcutMapContext } from '../../features/settings/context/hotkeySettingsContext';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ImmersiveShortcutsOverlay } from './ImmersiveShortcutsOverlay';

function renderOverlay(shortcutMap: Record<string, { primary: { key: string } }> = {}) {
  return renderWithLocalization(
    <CommandShortcutMapContext.Provider value={shortcutMap}>
      <ImmersiveShortcutsOverlay visible />
    </CommandShortcutMapContext.Provider>
  );
}

it('renders the registered immersive reading shortcuts', () => {
  renderOverlay({ 'editor.toggleImmersiveMode': { primary: { key: 'F11' } } });

  expect(screen.getByLabelText('Immersive reading shortcuts')).toHaveTextContent('Toggle immersive reading');
  expect(screen.getByLabelText('Immersive reading shortcuts')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByText('F11')).toBeInTheDocument();
  expect(screen.getByText('Toggle immersive reading').closest('li')).toHaveAttribute('aria-keyshortcuts', 'F11');
  expect(screen.getByText('ArrowDown')).toBeInTheDocument();
  expect(screen.getByText('ArrowDown').closest('li')).toHaveTextContent('Select the next paragraph');
  expect(screen.getByText('ArrowDown').closest('li')).toHaveAttribute('aria-keyshortcuts', 'ArrowDown');
  expect(screen.getByText('ArrowUp')).toBeInTheDocument();
});

it('does not advertise F11 for immersive reading in the browser host', () => {
  renderOverlay();

  expect(screen.queryByText('F11')).not.toBeInTheDocument();
  expect(screen.queryByText('Toggle immersive reading')).not.toBeInTheDocument();
  expect(screen.getByText('ArrowDown')).toBeInTheDocument();
});

it('shows the configured immersive reading shortcut instead of F11', () => {
  renderOverlay({ 'editor.toggleImmersiveMode': { primary: { key: 'F10' } } });

  expect(screen.getByText('F10')).toBeInTheDocument();
  expect(screen.queryByText('F11')).not.toBeInTheDocument();
});
