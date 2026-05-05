import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkspaceRightSidebarImportPanel } from './WorkspaceRightSidebarImportPanel';

describe('WorkspaceRightSidebarImportPanel', () => {
  it('keeps quick capture and formal import visibly separated', () => {
    render(<WorkspaceRightSidebarImportPanel />);

    expect(screen.getByRole('heading', { name: 'Import entry points' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quick capture' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Formal import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quick capture stays in editor' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Formal import coming soon' })).toBeDisabled();
  });

  it('shows a dedicated placeholder area for future import status', () => {
    render(<WorkspaceRightSidebarImportPanel />);

    expect(screen.getByRole('heading', { name: 'Import status' })).toBeInTheDocument();
    expect(screen.getByText('No imports yet')).toBeInTheDocument();
    expect(screen.getByText('Pending next task')).toBeInTheDocument();
    expect(screen.getByText('Nothing recorded')).toBeInTheDocument();
  });
});
