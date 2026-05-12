import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

it('does not expose Readwise catalog pages through the retired Watch Manager surface', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.queryByRole('button', { name: 'Readwise Books' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Readwise Articles' })).not.toBeInTheDocument();
});
