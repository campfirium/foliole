import { render, screen } from '@testing-library/react';

import { App } from '../app/App';

describe('App', () => {
  it('renders three-pane layout placeholders', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Nodes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument();
  });
});
