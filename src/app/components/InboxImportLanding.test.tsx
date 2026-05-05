import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { InboxImportLanding } from './InboxImportLanding';

vi.mock('../hooks/useFormalImport', () => ({
  useFormalImport: () => ({
    isAvailable: true,
    isImporting: false,
    overview: {
      latestFailure: null,
      latestResult: null,
      recentRuns: []
    },
    resetImportData: vi.fn(),
    startImportDirectory: vi.fn(),
    startImportFile: vi.fn(),
    status: {
      failures: '',
      inboxLanding: '',
      lastRun: ''
    }
  })
}));

it('keeps Inbox focused on imported nodes and recent runs', () => {
  render(<InboxImportLanding nodesById={{}} onSelectNode={() => undefined} />);

  expect(screen.getByText('Formal imports land under Inbox first. Review source metadata and recent outcomes here before opening a child node.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 3, name: 'Books inventory' })).not.toBeInTheDocument();
  expect(screen.getByText('No imported Inbox children yet.')).toBeInTheDocument();
});
