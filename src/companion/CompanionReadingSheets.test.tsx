import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadingActionsSheet, ReadingFontSheet, ReadingHighlightSheet } from './CompanionReadingSheets';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';

describe('ReadingActionsSheet', () => {
  it('opens secondary reading sheets from the More actions sheet', () => {
    const onOpenChange = vi.fn();
    const onOpenReadingSheet = vi.fn();
    render(
      <ReadingActionsSheet
        onFindInDocument={vi.fn()}
        onOpenChange={onOpenChange}
        onOpenReadingSheet={onOpenReadingSheet}
        open
      />
    );

    expect(screen.getByRole('button', { name: 'Font' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Info' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenReadingSheet).toHaveBeenCalledWith('highlight');
  });
});

describe('ReadingHighlightSheet', () => {
  it('renders current topic highlights and selects a highlight row', () => {
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();

    render(
      <ReadingHighlightSheet
        highlights={[{ from: 4, nodeId: 'highlight-1', text: 'Selected passage', to: 20 }]}
        onOpenChange={onOpenChange}
        onSelect={onSelect}
        open
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Selected passage' }));

    expect(screen.getByRole('dialog', { name: 'Highlight' })).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith({ from: 4, nodeId: 'highlight-1', text: 'Selected passage', to: 20 });
  });

  it('shows an empty state when the current topic has no highlights', () => {
    render(
      <ReadingHighlightSheet
        highlights={[]}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
        open
      />
    );

    expect(screen.getByText('No highlights in this topic')).toBeInTheDocument();
    expect(screen.getByText('Highlights you create in this topic will appear here.')).toBeInTheDocument();
  });
});

describe('ReadingFontSheet', () => {
  it('updates local reading typography settings from the Font sheet', () => {
    const onChange = vi.fn();

    render(
      <ReadingFontSheet
        onChange={onChange}
        onOpenChange={vi.fn()}
        open
        settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS}
      />
    );

    expect(screen.queryByText('Reading font controls are not available on Android yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Large' }));

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_READING_TYPOGRAPHY_SETTINGS,
      fontSize: 'large'
    });
  });
});
