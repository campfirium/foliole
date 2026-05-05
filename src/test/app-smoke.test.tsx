import { render, screen } from '@testing-library/react';

import { App } from '../app/App';

describe('App', () => {
  it('renders scaffold headline', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Foliole' })).toBeInTheDocument();
  });
});
