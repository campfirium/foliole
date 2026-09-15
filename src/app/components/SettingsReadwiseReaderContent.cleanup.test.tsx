import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { createReadwiseImportSources } from './importSourceWorkspaceModel';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

it('does not preview or show Readwise cleanup in folder mode', () => {
  const onPreviewCleanup = vi.fn();
  const onRunCleanup = vi.fn();

  renderWithLocalization(
    <SettingsReadwiseReaderContent
      config={{
        ...createDefaultReadwiseReaderConfig(),
        enabled: true,
        validatedAt: '2026-05-11T00:00:00.000Z'
      }}
      onPreviewCleanup={onPreviewCleanup}
      onRunCleanup={onRunCleanup}
      onSave={vi.fn()}
      readwiseRootPath="/Readwise"
      readwiseSources={createReadwiseImportSources('/Readwise')}
    />
  );

  expect(screen.queryByText('Clean up imports')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clean up...' })).not.toBeInTheDocument();
  expect(onPreviewCleanup).not.toHaveBeenCalled();
  expect(onRunCleanup).not.toHaveBeenCalled();
});
