import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const importSourceWorkspaceClosedMocks = vi.hoisted(() => ({
  details: vi.fn(() => <div data-testid="import-source-workspace-details">details</div>)
}));

vi.mock('./ImportSourceWorkspaceDetails', () => ({
  ImportSourceWorkspaceDetails: importSourceWorkspaceClosedMocks.details
}));

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

it('skips import workspace details while closed', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open={false} />);

  expect(importSourceWorkspaceClosedMocks.details).not.toHaveBeenCalled();
  expect(screen.queryByTestId('import-source-workspace-details')).not.toBeInTheDocument();
});
