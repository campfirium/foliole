import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { COMPANION_ANDROID_CAPTURE_BACK_EVENT } from './companionAndroidBackEvent';
import { CompanionCaptureSheet } from './CompanionCaptureSheet';

describe('CompanionCaptureSheet', () => {
  beforeEach(() => window.localStorage.clear());
  it('keeps save disabled until text is entered', () => {
    renderWithLocalization(
      <CompanionCaptureSheet draftScope="test" onOpenChange={vi.fn()} onSave={vi.fn()} open />
    );

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Quick note' } });

    expect(saveButton).toBeEnabled();
  });

  it('saves entered text and closes the sheet', async () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn(async () => ({ nodeId: 'captured' }));
    renderWithLocalization(
      <CompanionCaptureSheet draftScope="test" onOpenChange={onOpenChange} onSave={onSave} open />
    );

    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Quick note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Quick note'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the draft visible when saving fails', async () => {
    const onSave = vi.fn(async () => ({ error: 'save-failed' as const }));
    renderWithLocalization(
      <CompanionCaptureSheet draftScope="test" onOpenChange={vi.fn()} onSave={onSave} open />
    );

    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Quick note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save this topic. Try again.');
    expect(screen.getByLabelText('Capture text')).toHaveValue('Quick note');
  });

  it('discards the draft when closed', () => {
    const { rerender } = renderWithLocalization(
      <CompanionCaptureSheet draftScope="test" onOpenChange={vi.fn()} onSave={vi.fn()} open />
    );

    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Quick note' } });
    rerender(<CompanionCaptureSheet draftScope="test" onOpenChange={vi.fn()} onSave={vi.fn()} open={false} />);
    rerender(<CompanionCaptureSheet draftScope="test" onOpenChange={vi.fn()} onSave={vi.fn()} open />);

    expect(screen.getByLabelText('Capture text')).toHaveValue('');
  });

  it('closes for system Back and restores the unfinished draft when reopened', () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn();
    const { rerender, unmount } = renderWithLocalization(
      <CompanionCaptureSheet draftScope="test" onOpenChange={onOpenChange} onSave={onSave} open />
    );
    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Unfinished note' } });
    document.dispatchEvent(new Event(COMPANION_ANDROID_CAPTURE_BACK_EVENT, { cancelable: true }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<CompanionCaptureSheet draftScope="test" onOpenChange={onOpenChange} onSave={onSave} open={false} />);
    rerender(<CompanionCaptureSheet draftScope="test" onOpenChange={onOpenChange} onSave={onSave} open />);
    expect(screen.getByLabelText('Capture text')).toHaveValue('Unfinished note');
    expect(onSave).not.toHaveBeenCalled();
    unmount();
    const restarted = renderWithLocalization(<CompanionCaptureSheet draftScope="test" onOpenChange={onOpenChange} onSave={onSave} open={false} />);
    restarted.rerender(<CompanionCaptureSheet draftScope="test" onOpenChange={onOpenChange} onSave={onSave} open />);
    expect(screen.getByLabelText('Capture text')).toHaveValue('Unfinished note');
  });
});
