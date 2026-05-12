import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

it('does not show retired Watch Manager loading or error states', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.queryByText('Watch folders could not be loaded.')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading Watch Manager')).not.toBeInTheDocument();
});
