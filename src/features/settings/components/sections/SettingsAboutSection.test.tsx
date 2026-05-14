import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/diagnosticBundle', () => ({
  exportDiagnosticBundle: vi.fn()
}));

import { exportDiagnosticBundle } from '../../../../shared/platform/diagnosticBundle';

import { SettingsAboutSection } from './SettingsAboutSection';

beforeEach(() => {
  vi.mocked(exportDiagnosticBundle).mockReset();
});

it('shows application info and diagnostic export in the about section', async () => {
  vi.mocked(exportDiagnosticBundle).mockResolvedValue({
    filePath: '/Desktop/foliole-diagnostics.zip',
    includedFileCount: 3,
    status: 'exported'
  });
  render(<SettingsAboutSection />);

  expect(screen.getByText('Foliole desktop')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Export diagnostic bundle' }));
  await waitFor(() => {
    expect(exportDiagnosticBundle).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Diagnostic bundle exported with 3 files.')).toBeInTheDocument();
  });
  expect(screen.queryByText('/app/Backups')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create backup' })).not.toBeInTheDocument();
});
