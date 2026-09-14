import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import type { EditorAdapter } from '../adapters/EditorAdapter';
import { requestFormatCleanup } from '../model/formatCleanupRequests';

import { FormatCleanupDialogHost } from './FormatCleanupDialogHost';

function createEditorRef(content: string) {
  const editor = {
    getContent: vi.fn(() => content),
    replaceRange: vi.fn()
  } as unknown as EditorAdapter;
  return { editor, ref: { current: editor } };
}

describe('FormatCleanupDialogHost', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens settings on the first direct run, then cleans in one editor replacement', async () => {
    const { editor, ref } = createEditorRef('  - First\n\n\nSecond');
    renderWithLocalization(<FormatCleanupDialogHost canClean editorRef={ref} />);

    requestFormatCleanup('clean');
    expect(await screen.findByRole('dialog', { name: 'Clean formatting' })).toBeInTheDocument();
    expect(editor.replaceRange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Clean' }));
    expect(editor.replaceRange).toHaveBeenCalledTimes(1);
    expect(editor.replaceRange).toHaveBeenCalledWith(0, 18, 'First\n\nSecond');
  });

  it('previews without modifying the editor', async () => {
    const { editor, ref } = createEditorRef('# Heading');
    renderWithLocalization(<FormatCleanupDialogHost canClean editorRef={ref} />);

    requestFormatCleanup('configure');
    await screen.findByRole('dialog', { name: 'Clean formatting' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByText('Heading')).toBeInTheDocument();
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it('inserts visible special values into the targeted rule field', async () => {
    const { ref } = createEditorRef('Text');
    renderWithLocalization(<FormatCleanupDialogHost canClean editorRef={ref} />);
    requestFormatCleanup('configure');
    await screen.findByRole('dialog', { name: 'Clean formatting' });

    const fields = screen.getAllByRole('textbox', { name: 'Find for rule 1' });
    const customFind = fields.at(-1) as HTMLInputElement;
    fireEvent.change(customFind, { target: { value: 'ab' } });
    customFind.setSelectionRange(1, 1);
    fireEvent.select(customFind);
    fireEvent.click(screen.getByRole('button', { name: '␣ Space' }));

    expect(customFind).toHaveValue('a␣b');
  });
});
