import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

it('does not render the retired Watch Manager surface', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Watch Manager')).not.toBeInTheDocument();
});
