import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadingChrome } from './CompanionReadingChrome';

function renderChrome() {
  return render(
    <ReadingChrome
      onExit={vi.fn()}
      onOpenActions={vi.fn()}
      onOpenOutline={vi.fn()}
      onOpenSheet={vi.fn()}
      title="Long reading title"
    />
  );
}

describe('ReadingChrome', () => {
  it('keeps fixed reading controls spaced without relying only on flex gap', () => {
    renderChrome();

    const topRow = screen.getByRole('button', { name: 'Exit' }).closest('div');
    expect(topRow?.className).toContain('gap-2');
    expect(topRow?.className).toContain('[&>*+*]:ml-2');

    const bottomRow = screen.getByRole('button', { name: 'More reading actions' }).parentElement;
    expect(bottomRow?.className).toContain('gap-2');
    expect(bottomRow?.className).toContain('[&>*+*]:ml-2');
  });
});
