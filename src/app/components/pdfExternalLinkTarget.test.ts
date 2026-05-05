import { describe, expect, it } from 'vitest';

import { resolvePdfExternalHref } from './pdfExternalLinkTarget';

describe('resolvePdfExternalHref', () => {
  it('finds annotation links inside rendered pdf pages', () => {
    document.body.innerHTML = `
      <div class="react-pdf__Page__annotations">
        <a href="https://example.com/docs"><span data-testid="inner">Open</span></a>
      </div>
    `;

    const target = document.querySelector('[data-testid="inner"]');
    expect(resolvePdfExternalHref(target)).toBe('https://example.com/docs');
  });

  it('ignores unrelated clicks outside pdf links', () => {
    document.body.innerHTML = '<div data-testid="plain">Plain</div>';
    expect(resolvePdfExternalHref(document.querySelector('[data-testid="plain"]'))).toBeNull();
  });
});
