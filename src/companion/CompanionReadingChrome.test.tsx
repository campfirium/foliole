import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadingChrome } from './CompanionReadingChrome';

function renderChrome() {
  return render(
    <ReadingChrome
      onExit={vi.fn()}
      onOpenActions={vi.fn()}
      onOpenOutline={vi.fn()}
      title="Long reading title"
    />
  );
}

describe('ReadingChrome', () => {
  it('groups reading navigation and centers the title in the toolbar', () => {
    renderChrome();

    const navigation = screen.getByRole('button', { name: 'Exit' }).parentElement;
    expect(navigation).toContainElement(screen.getByRole('button', { name: 'Outline' }));
    expect(navigation?.className).not.toContain('gap-');
    expect(screen.getByText('Long reading title').className).toContain('left-1/2');
    expect(screen.getByText('Long reading title').className).toContain('text-center');

    const bottomRow = screen.getByRole('button', { name: 'More reading actions' }).parentElement;
    expect(bottomRow?.className).toContain('gap-2');
    expect(bottomRow?.className).toContain('[&>*+*]:ml-2');
  });

  it('keeps secondary reading actions out of the narrow top chrome', () => {
    renderChrome();

    expect(screen.queryByRole('button', { name: 'Font' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Info' })).not.toBeInTheDocument();
  });

  it('exposes the reading exit as a stable host acceptance target', () => {
    renderChrome();

    expect(screen.getByTestId('companion-reading-exit')).toHaveAccessibleName('Exit');
  });

  it('keeps reading controls compact and clear of Android safe areas', () => {
    renderChrome();

    expect(screen.getByRole('button', { name: 'Exit' }).closest('div')?.parentElement?.parentElement?.className).toContain('pt-0');
    expect(screen.getByRole('button', { name: 'Exit' }).className).toContain('h-11');
    expect(screen.getByRole('button', { name: 'Exit' }).className).not.toContain('ring-companion-divider');
    expect(screen.getByText('Long reading title').className).toContain('text-center');
    expect(screen.getByText('Long reading title').closest('div')?.parentElement?.className).toContain('px-2.5');
    expect(screen.getByRole('button', { name: 'More reading actions' }).parentElement?.className).toContain('justify-end');
    expect(screen.getByRole('button', { name: 'More reading actions' }).parentElement?.parentElement?.className).toContain('bottom-0');
    expect(screen.getByRole('button', { name: 'More reading actions' }).parentElement?.parentElement?.className).not.toContain('border-t');
  });
});

describe('ReadingChrome hidden blockers', () => {
  it('keeps blank chrome blockers mounted while reading controls are hidden', () => {
    render(
      <ReadingChrome
        onExit={vi.fn()}
        onOpenActions={vi.fn()}
        onOpenOutline={vi.fn()}
        title="Long reading title"
        visible={false}
      />
    );

    expect(screen.queryByRole('button', { name: 'Exit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More reading actions' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.bg-companion-base')).toHaveLength(2);
  });
});

describe('ReadingChrome editing', () => {
  it('moves editing controls to the top chrome while the keyboard owns the bottom area', () => {
    const onToggleContentEditing = vi.fn();

    render(
      <ReadingChrome
        canEditContent={true}
        isContentEditing={true}
        onExit={vi.fn()}
        onOpenActions={vi.fn()}
        onOpenOutline={vi.fn()}
        onToggleContentEditing={onToggleContentEditing}
        title="Long reading title"
      />
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText('Edit content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More reading actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit topic' })).not.toBeInTheDocument();
  });
});
