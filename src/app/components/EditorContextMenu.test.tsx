import { render, screen } from '@testing-library/react';
import { it, expect, vi } from 'vitest';

import { EditorContextMenu } from './EditorContextMenu';

it('does not show cloze in the image context menu', () => {
  render(
    <EditorContextMenu
      kind="image"
      left={16}
      top={24}
      onClose={vi.fn()}
      onCopyImage={vi.fn()}
      onCreateCloze={vi.fn()}
      onCreateHighlight={vi.fn()}
      onCutImage={vi.fn()}
      onDeleteImage={vi.fn()}
      onExportImage={vi.fn()}
    />
  );

  expect(screen.getByRole('menuitem', { name: 'Highlight' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Cloze' })).toBeNull();
});
