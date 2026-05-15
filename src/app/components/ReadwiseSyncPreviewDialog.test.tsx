import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createReadwiseImportPreview } from './readwiseReaderSettingsTestSupport';
import { ReadwiseSyncPreviewDialog } from './ReadwiseSyncPreviewDialog';

it('keeps the start action label while showing progress feedback', () => {
  render(
    <ReadwiseSyncPreviewDialog
      error={null}
      isPreviewing={false}
      isStarting={true}
      notice={null}
      onCancel={vi.fn()}
      onStart={vi.fn()}
      open={true}
      preview={createReadwiseImportPreview()}
    />
  );

  const startButton = screen.getByRole('button', { name: 'Start' });
  expect(startButton).toBeDisabled();
  expect(startButton.querySelector('.animate-spin')).not.toBeNull();
  expect(screen.queryByRole('button', { name: /Starting/ })).not.toBeInTheDocument();
});
