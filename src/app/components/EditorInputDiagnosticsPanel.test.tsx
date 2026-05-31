import { render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { EditorInputDiagnosticsPanel } from './EditorInputDiagnosticsPanel';

type EditorInputDiagnosticsPanelGlobal = typeof globalThis & {
  __FOLIOLE_EDITOR_INPUT_DIAG_PANEL?: boolean;
};

function setPanelEnabled(enabled: boolean) {
  (globalThis as EditorInputDiagnosticsPanelGlobal).__FOLIOLE_EDITOR_INPUT_DIAG_PANEL = enabled;
}

afterEach(() => {
  delete (globalThis as EditorInputDiagnosticsPanelGlobal).__FOLIOLE_EDITOR_INPUT_DIAG_PANEL;
});

it('hides the editor input diagnostics panel by default', () => {
  render(<EditorInputDiagnosticsPanel />);

  expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Stopped|Recording/)).not.toBeInTheDocument();
});

it('shows the editor input diagnostics panel when explicitly enabled', () => {
  setPanelEnabled(true);

  render(<EditorInputDiagnosticsPanel />);

  expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
});
