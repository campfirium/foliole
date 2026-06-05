import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { createReadwiseImportPreview } from './readwiseReaderSettingsTestSupport';
import { ReadwisePreviewSummary } from './ReadwiseSyncPreviewList';

it('summarizes external destinations separately from inbox imports', () => {
  const preview = createReadwiseImportPreview();
  preview.entries = [
    {
      destination: 'external',
      detail: null,
      detected_highlight_count: 1,
      highlight_status: 'highlight_only',
      highlight_type: 'with_highlights',
      source_kind: 'articles',
      source_path: 'HighlightOnly.md',
      status: 'new'
    },
    {
      destination: 'off',
      detail: 'Skipped by current import behavior.',
      detected_highlight_count: 0,
      highlight_status: 'without_highlights',
      highlight_type: 'without_highlights',
      source_kind: 'articles',
      source_path: 'Plain.md',
      status: 'off'
    }
  ];

  renderWithLocalization(<ReadwisePreviewSummary preview={preview} />);

  expect(screen.getByText('1 ready for external folders (1 highlight-only), 1 skipped.')).toBeInTheDocument();
});
