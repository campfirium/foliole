import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { WebLookupSelectionMenu } from './WebLookupSelectionMenu';

beforeEach(() => window.localStorage.clear());

it('shows Clean formatting but not Repair Table by default even when repair is available', () => {
  render(<WebLookupSelectionMenu
    documentText="Topic text"
    left={16}
    onClose={vi.fn()}
    onConfigureFormatCleanup={vi.fn()}
    onRepairTable={vi.fn()}
    repairTableAvailable
    selectionPayload={null}
    top={24}
  />);
  expect(screen.getByRole('menuitem', { name: 'Clean formatting...' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Repair Table' })).toBeNull();
});
