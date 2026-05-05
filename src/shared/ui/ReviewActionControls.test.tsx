import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReviewGradeActions } from './ReviewActionControls';

describe('ReviewActionControls', () => {
  it('renders companion-friendly grade buttons as a single shared row when requested', () => {
    const submitGrade = vi.fn(async () => undefined);

    render(
      <ReviewGradeActions
        buttonClassName="min-w-0 flex-1 px-3"
        buttonVariant="primary"
        errorMessage={null}
        groupClassName="w-full gap-2"
        isSubmitting={false}
        submitGrade={submitGrade}
      />
    );

    const group = screen.getByLabelText('Review grade actions');
    expect(group.className).toContain('w-full');
    expect(screen.getByRole('button', { name: 'Again' }).className).toContain('flex-1');
    expect(screen.getByRole('button', { name: 'Again' }).className).toContain('border');
    expect(screen.getByRole('button', { name: 'Easy' }).className).toContain('flex-1');

    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    expect(submitGrade).toHaveBeenCalledWith(3);
  });
});
