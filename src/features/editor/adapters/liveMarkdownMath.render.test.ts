import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  registerFormulaClozeEditorPresentation,
  unregisterFormulaClozeEditorPresentation
} from '../../formula-cloze/model/formulaClozePresentation';

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

  it('renders saved formula cloze presentation regions on matching formula occurrences', async () => {
    const content = 'Inline $E=mc^2$';
    const from = content.indexOf('$E=mc^2$');
    const to = from + '$E=mc^2$'.length;
    const { adapter, host } = createAdapterHost(content);
    adapter.setNodeId('node-1');

    registerFormulaClozeEditorPresentation('node-1', {
      canCreate: true,
      hiddenRegionIds: ['formula-region-1'],
      outlinedRegionIds: [],
      regions: [
        {
          display: 'inline',
          fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
          formulaSource: '$E=mc^2$',
          id: 'formula-region-1',
          occurrenceKey: `inline:${from}:${to}:E=mc^2`,
          selection: {
            algorithm: 'katex-dom-leaf-v1',
            fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
            leaves: [{ path: [0], structureFingerprint: 'mord', textFingerprint: 'E=mc2' }]
          }
        }
      ]
    });
    adapter.refreshImageClozePresentation();

    await waitFor(() => {
      expect(host.querySelector('.cm-md-formula-cloze-region')).toHaveAttribute('data-md-formula-region-hidden', 'true');
    });

    unregisterFormulaClozeEditorPresentation('node-1');
    adapter.destroy();
  });
});
