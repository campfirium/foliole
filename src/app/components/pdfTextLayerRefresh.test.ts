import { describe, expect, it } from 'vitest';

import { resolveTextLayerRefreshSignature, shouldRefreshTextLayer } from './pdfTextLayerRefresh';

describe('pdfTextLayerRefresh', () => {
  it('captures text layer count, child count, and text length in the signature', () => {
    const shell = document.createElement('div');
    shell.innerHTML = `
      <div class="textLayer"><span>alpha</span><span>beta</span></div>
      <div class="textLayer"><span>gamma</span></div>
    `;

    expect(resolveTextLayerRefreshSignature(shell)).toBe('2:3:14');
  });

  it('refreshes only when the page text layer signature changes', () => {
    const shell = document.createElement('div');
    shell.innerHTML = '<div class="textLayer"><span>alpha</span></div>';
    const previousSignatures: Record<number, string> = {};

    expect(shouldRefreshTextLayer({ pageNumber: 1, previousSignatures, shell })).toBe(true);
    previousSignatures[1] = resolveTextLayerRefreshSignature(shell) ?? '';

    expect(shouldRefreshTextLayer({ pageNumber: 1, previousSignatures, shell })).toBe(false);

    shell.querySelector('.textLayer')?.appendChild(document.createElement('span')).append('beta');

    expect(shouldRefreshTextLayer({ pageNumber: 1, previousSignatures, shell })).toBe(true);
  });
});
