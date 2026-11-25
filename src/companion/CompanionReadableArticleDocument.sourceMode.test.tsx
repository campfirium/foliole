import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import {
  COMPANION_EDITOR_DISPLAY_MODE_STORAGE_KEY,
  resetCompanionEditorDisplayModeForTest,
  setCompanionEditorDisplayMode
} from './companionEditorDisplayMode';
import { CompanionEditorDisplayModeAction } from './CompanionEditorDisplayModeAction';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';

const editorMock = vi.hoisted(() => ({
  mounts: 0,
  props: null as null | { displayMode?: string; onChange: (content: string) => void; readOnly?: boolean; value: string }
}));

vi.mock('@/features/editor/components/MarkdownEditor', async () => {
  const { useEffect } = await import('react');
  return {
    MarkdownEditor: (props: NonNullable<typeof editorMock.props>) => {
      editorMock.props = props;
      useEffect(() => {
        editorMock.mounts += 1;
      }, []);
      return <textarea aria-label="Topic body" data-display-mode={props.displayMode} readOnly={props.readOnly}
        onChange={(event) => props.onChange(event.currentTarget.value)} value={props.value} />;
    }
  };
});

const typography = {
  contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default',
  paragraphSpacing: 0.35, fontWeight: 400, textWidth: 100
} as const;

function renderDocument(allowContentEditing: boolean) {
  return render(
    <ReadableArticleDocument allowContentEditing={allowContentEditing} onSaveContent={createContentSaveMock()}
      readableArticle={{ content: '**Bold** body', hideTitleHeading: false, nodeId: 'topic-1', persistedNodeViewState: null,
        pdfAttachmentId: null, textAnchorDecorations: [], title: 'Topic' }}
      readingTypographySettings={typography} />
  );
}

afterEach(() => {
  window.localStorage.removeItem(COMPANION_EDITOR_DISPLAY_MODE_STORAGE_KEY);
  resetCompanionEditorDisplayModeForTest();
  editorMock.mounts = 0;
});

describe('companion Markdown source mode', () => {
  it('switches the whole body to source while editing and keeps unsaved text across the switch', () => {
    renderDocument(true);
    expect(screen.getByLabelText('Topic body')).toHaveAttribute('data-display-mode', 'preview');
    fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: '**Bold** edited' } });
    const mountsBefore = editorMock.mounts;

    act(() => setCompanionEditorDisplayMode('source'));

    expect(screen.getByLabelText('Topic body')).toHaveAttribute('data-display-mode', 'source');
    expect(screen.getByLabelText('Topic body')).toHaveValue('**Bold** edited');
    expect(editorMock.mounts).toBe(mountsBefore + 1);
    expect(window.localStorage.getItem(COMPANION_EDITOR_DISPLAY_MODE_STORAGE_KEY)).toBe('source');
  });

  it('keeps reading in live preview even when the editing preference is source', () => {
    setCompanionEditorDisplayMode('source');
    renderDocument(false);
    expect(screen.getByLabelText('Topic body')).toHaveAttribute('data-display-mode', 'preview');
    expect(screen.getByLabelText('Topic body')).toHaveAttribute('readonly');
  });

  it('offers the opposite mode in the reading menu row and closes the sheet after switching', () => {
    const onDone = vi.fn();
    render(<CompanionEditorDisplayModeAction onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Source mode' }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Switch to Live Preview mode' })).toBeInTheDocument();
  });
});
