import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WebGuidesApp } from './WebGuidesApp';
import { DEFAULT_WEB_GUIDE } from './webGuidesContent';

describe('Web Guides app', () => {
  it('renders the default static guide from the seed', () => {
    render(<WebGuidesApp />);

    expect(screen.getByRole('heading', { name: DEFAULT_WEB_GUIDE.title })).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_WEB_GUIDE.summary)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: DEFAULT_WEB_GUIDE.sections[0]?.heading })).toBeInTheDocument();
  });
});
