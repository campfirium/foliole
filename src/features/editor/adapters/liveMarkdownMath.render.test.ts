import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

describe('live Markdown math rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders inline and block math with KaTeX widgets', async () => {
    const { adapter, host } = createAdapterHost('Inline $E=mc^2$\n\n$$\na^2+b^2=c^2\n$$');

    await waitFor(() => {
      expect(host.querySelectorAll('.cm-md-math-widget-inline .katex').length).toBe(1);
      expect(host.querySelectorAll('.cm-md-math-widget-block .katex-display').length).toBe(1);
    });
    expect(host.querySelector('.cm-md-math-widget-inline')).toHaveAttribute('data-md-math-tex', 'E=mc^2');
    expect(host.querySelector('.cm-md-math-widget-block')).toHaveAttribute('data-md-math-tex', 'a^2+b^2=c^2');

    adapter.destroy();
  });

  it('keeps unsafe or invalid formulas readable instead of throwing', async () => {
    const { adapter, host } = createAdapterHost('Broken $\\notacommand$');

    await waitFor(() => {
      expect(host.querySelector('.cm-md-math-widget-inline')).not.toBeNull();
    });
    expect(host.textContent).toContain('\\notacommand');

    adapter.destroy();
  });
});
