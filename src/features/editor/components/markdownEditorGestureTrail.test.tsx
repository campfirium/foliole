import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GestureDirectionHintOverlay } from './markdownEditorGestureTrail';

describe('GestureDirectionHintOverlay', () => {
  it('renders lightweight command feedback at the fixed gesture origin', () => {
    render(
      <GestureDirectionHintOverlay
        commandTitle="Scroll to bottom"
        directions={['right', 'down']}
        position={{ x: 120, y: 80 }}
      />
    );

    const hint = screen.getByText('Scroll to bottom').parentElement;
    expect(hint).toHaveAttribute('data-editor-gesture-hint', 'true');
    expect(hint).toHaveStyle({ left: '120px', top: '80px' });
    expect(hint).toHaveClass('text-foreground/55');
    expect(hint).not.toHaveClass('bg-foreground/80');
    expect(hint).toHaveTextContent('→↓');
  });
});
