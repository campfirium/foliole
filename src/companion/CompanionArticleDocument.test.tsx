import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionArticleDocument } from './CompanionArticleDocument';

vi.mock('../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: () => <div>Editor</div>
}));

describe('CompanionArticleDocument', () => {
  it('keeps a 100vh fallback before dynamic viewport sizing for old WebView', () => {
    const { container } = render(<CompanionArticleDocument content="Body" nodeId="topic-1" />);

    const surface = container.querySelector('section');
    const className = surface?.className ?? '';
    expect(className).toContain('min-h-[calc(100vh-9rem)]');
    expect(className).toContain('min-h-[calc(100dvh-9rem)]');
    expect(className.indexOf('100vh')).toBeLessThan(className.indexOf('100dvh'));
    expect(surface?.style.getPropertyValue('--document-content-inline-padding')).toBe('0px');
    expect(surface).toHaveAttribute('data-companion-readable-document', 'true');
    expect(surface).toHaveAttribute('data-companion-article-document', 'true');
  });

  it('keeps review cards free of article viewport minimums', () => {
    const { container } = render(<CompanionArticleDocument content="Body" layout="review" nodeId="topic-1" />);

    const surface = container.querySelector('section');
    expect(surface).toHaveClass('min-h-0');
    expect(surface?.className).not.toContain('100dvh');
    expect(surface).not.toHaveAttribute('data-companion-readable-document');
    expect(surface).toHaveAttribute('data-companion-article-document', 'true');
  });
});
