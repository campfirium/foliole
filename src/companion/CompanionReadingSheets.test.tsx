import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadingActionsSheet, ReadingFontSheet } from './CompanionReadingSheets';
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

    expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Info' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore from trash' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenReadingSheet).toHaveBeenCalledWith('font');
  });

  it('keeps a failed trash restore visible in the actions sheet', async () => {
    const onOpenChange = vi.fn();
    render(
      <ReadingActionsSheet
        onFindInDocument={vi.fn()}
        onOpenChange={onOpenChange}
        onOpenReadingSheet={vi.fn()}
        onRestoreFromTrash={vi.fn(async () => {
          throw new Error('local_restore_not_applied');
        })}
        open
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore from Trash' }));

    expect(await screen.findByText('This topic could not be restored on this device.')).toBeInTheDocument();
    await waitFor(() => expect(onOpenChange).not.toHaveBeenCalledWith(false));
  });

  it('keeps a synchronously failed trash restore visible in the actions sheet', async () => {
    const onOpenChange = vi.fn();
    render(
      <ReadingActionsSheet
        onFindInDocument={vi.fn()}
        onOpenChange={onOpenChange}
        onOpenReadingSheet={vi.fn()}
        onRestoreFromTrash={() => {
          throw new Error('local_restore_not_applied');
        }}
        open
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore from Trash' }));

    expect(await screen.findByText('This topic could not be restored on this device.')).toBeInTheDocument();
    await waitFor(() => expect(onOpenChange).not.toHaveBeenCalledWith(false));
  });
});

describe('ReadingFontSheet', () => {
  it('updates local reading typography settings from the Appearance sheet', () => {
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
    expect(screen.getByText('16px')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Increase Size' }));

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_READING_TYPOGRAPHY_SETTINGS,
      fontSize: 17
    });
  });
});

it('disables adjustments at the supported reading limits', () => {
  const onChange = vi.fn();
  const view = render(<ReadingFontSheet open onOpenChange={vi.fn()} onChange={onChange}
    settings={{ ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, fontSize: 14, lineHeight: 1.3 }} />);
  expect(screen.getByRole('button', { name: 'Decrease Size' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Decrease Line height' })).toBeDisabled();
  view.rerender(<ReadingFontSheet open onOpenChange={vi.fn()} onChange={onChange}
    settings={{ ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, fontSize: 80, lineHeight: 2 }} />);
  expect(screen.getByRole('button', { name: 'Increase Size' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Increase Line height' })).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
});


it('disables paragraph spacing changes at the shared bounds', () => {
  const onChange = vi.fn();
  const view = render(<ReadingFontSheet open onOpenChange={() => undefined} onChange={onChange}
    settings={{ ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, paragraphSpacing: 0 }} />);
  expect(screen.getByRole('button', { name: 'Decrease Paragraph spacing' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Increase Paragraph spacing' }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ paragraphSpacing: 0.05 }));
  view.rerender(<ReadingFontSheet open onOpenChange={() => undefined} onChange={onChange}
    settings={{ ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, paragraphSpacing: 1.5 }} />);
  expect(screen.getByRole('button', { name: 'Increase Paragraph spacing' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Paragraph spacing' }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ paragraphSpacing: 1.45 }));
});
