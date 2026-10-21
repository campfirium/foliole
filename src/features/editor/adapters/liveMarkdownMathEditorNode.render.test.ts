import { waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import {
  registerFormulaClozeEditorPresentation,
  unregisterFormulaClozeEditorPresentation
} from '../../formula-cloze/model/formulaClozePresentation';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

const content = 'Inline $E=mc^2$';
const from = content.indexOf('$E=mc^2$');
const to = from + '$E=mc^2$'.length;

afterEach(() => {
  unregisterFormulaClozeEditorPresentation('node-parent');
  unregisterFormulaClozeEditorPresentation('node-child');
  document.body.replaceChildren();
});

it('rebuilds a formula with the new topic presentation when the editor switches topics', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });
  adapter.setNodeId('node-parent');
  await waitFor(() => expect(host.querySelector('.cm-md-math-widget-inline')).not.toBeNull());
  expect(host.querySelector('.cm-md-formula-cloze-region')).toBeNull();

  registerFormulaClozeEditorPresentation('node-child', {
    canCreate: false,
    hiddenRegionIds: ['formula-region-1'],
    outlinedRegionIds: [],
    regions: [{
      display: 'inline',
      fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
      formulaSource: '$ E=mc^2 $',
      id: 'formula-region-1',
      occurrenceKey: `inline:${from}:${to}:E=mc^2`,
      selection: {
        algorithm: 'katex-dom-leaf-v1',
        fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
        leaves: [{ path: [0], structureFingerprint: 'mord', textFingerprint: 'E=mc2' }]
      }
    }]
  });
  adapter.setNodeId('node-child');

  await waitFor(() => {
    expect(host.querySelector('.cm-md-formula-cloze-region')).toHaveAttribute('data-md-formula-region-hidden', 'true');
  });
  adapter.destroy();
});
