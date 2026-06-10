import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveWebGuideFromPath, WebGuidesApp } from './WebGuidesApp';
import { canonicalGuidePath, DEFAULT_WEB_GUIDE, WEB_GUIDES } from './webGuidesContent';

describe('Web Guides app', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('renders a readonly guide directory and the default guide', () => {
    render(<WebGuidesApp />);

    expect(screen.getByRole('navigation', { name: 'Guides' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: DEFAULT_WEB_GUIDE.title })).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_WEB_GUIDE.summary)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: DEFAULT_WEB_GUIDE.sections[0]?.heading })).toBeInTheDocument();

    for (const guide of WEB_GUIDES) {
      expect(screen.getByRole('link', { name: new RegExp(guide.title) })).toHaveAttribute('href', canonicalGuidePath(guide.slug));
    }
  });

  it('selects the guide that matches the current canonical path', () => {
    const selectedGuide = WEB_GUIDES[1] ?? DEFAULT_WEB_GUIDE;
    window.history.replaceState({}, '', canonicalGuidePath(selectedGuide.slug));

    render(<WebGuidesApp />);

    expect(screen.getByRole('heading', { name: selectedGuide.title })).toBeInTheDocument();
    expect(screen.getByText(selectedGuide.summary)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(selectedGuide.title) })).toHaveAttribute('aria-current', 'page');
  });

  it('falls back to the default guide for an unknown path', () => {
    expect(resolveWebGuideFromPath('/guides/missing/')).toBe(DEFAULT_WEB_GUIDE);
  });

  it('does not expose desktop or sync controls in the readonly surface', () => {
    render(<WebGuidesApp />);

    expect(screen.queryByText(/settings|sync|database|readwise|dev panel|update/i)).not.toBeInTheDocument();
  });
});
