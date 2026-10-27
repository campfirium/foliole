import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { registerFormulaClozeEditorPresentation, unregisterFormulaClozeEditorPresentation } from '../../formula-cloze/model/formulaClozePresentation';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';
import { folioleMarkdownParser } from '../model/folioleMarkdownParser';

import { MarkdownEditor } from './MarkdownEditor';

afterEach(() => { vi.restoreAllMocks(); unregisterFormulaClozeEditorPresentation('prepared-formula'); });

it('prepares a reading paragraph without repeatedly rebuilding the same initial presentation', () => {
  const text = `**Prepared body** ${Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')}`;
  const parse = vi.spyOn(folioleMarkdownParser, 'parse');
  render(<LocalizationProvider><MouseGestureSettingsProvider>
    <MarkdownEditor nodeId="prepared" readOnly readOnlyInteractionMode="document"
      ariaLabel="Prepared article" onChange={() => {}} value={text} />
  </MouseGestureSettingsProvider></LocalizationProvider>);
  expect(screen.getByRole('document', { name: 'Prepared article' })).toHaveTextContent('Prepared body');
  expect(screen.getByRole('document', { name: 'Prepared article' }).querySelector('.cm-md-strong')).toHaveTextContent('Prepared body');
  expect(parse.mock.calls.filter(([input]) => input === text).length).toBeLessThanOrEqual(1);
});


it('renders an existing formula mask initially and updates its visibility after external changes', async () => {
  const rect = { height: 0.4, width: 0.3, x: 0.1, y: 0.2 };
  const presentation = { canCreate: false, hiddenRegionIds: ['region'], outlinedRegionIds: [],
    regions: [{ display: 'inline' as const, fallbackRect: rect, formulaSource: '$E=mc^2$', id: 'region',
      occurrenceKey: 'inline:0:8:E=mc^2', selection: { algorithm: 'katex-dom-leaf-v1' as const,
        fallbackRect: rect, leaves: [{ path: [0], structureFingerprint: 'mord', textFingerprint: 'E=mc2' }] } }] };
  registerFormulaClozeEditorPresentation('prepared-formula', presentation);
  const view = render(<LocalizationProvider><MouseGestureSettingsProvider>
    <MarkdownEditor nodeId="prepared-formula" readOnly readOnlyInteractionMode="document"
      ariaLabel="Formula article" onChange={() => {}} value="$E=mc^2$" />
  </MouseGestureSettingsProvider></LocalizationProvider>);
  const mask = () => view.container.querySelector('[data-md-formula-region-id="region"]');
  await waitFor(() => expect(mask()).toHaveAttribute('data-md-formula-region-hidden', 'true'));
  act(() => registerFormulaClozeEditorPresentation('prepared-formula', {
    ...presentation, hiddenRegionIds: [], outlinedRegionIds: ['region']
  }));
  await waitFor(() => expect(mask()).toHaveAttribute('data-md-formula-region-hidden', 'false'));
  expect(mask()).toHaveAttribute('data-md-formula-region-outlined', 'true');
});
