import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import {
  IMAGE_EXCERPT_REGION_SELECTED_EVENT,
  type ImageExcerptRegionSelection
} from '../../features/editor/model/imageExcerptRegionSelection';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ImageExcerptAnnotationCreation } from './ImageExcerptAnnotationCreation';
import { renderImageExcerptCrop } from './imageExcerptCrop';

vi.mock('./imageExcerptCrop', async (importOriginal) => {
  const original = await importOriginal<typeof import('./imageExcerptCrop')>();
  return { ...original, renderImageExcerptCrop: vi.fn(async () => new Uint8Array([1, 2, 3])) };
});

const imageMarkdown = '![Cover](asset://source-image.png)';
const createExcerpt = vi.fn(async () => 'excerpt-1');
const editor = { getContent: () => `Lead\n${imageMarkdown}` } as EditorAdapter;

function renderCreation() {
  return render(
    <LocalizationProvider>
      <ImageExcerptAnnotationCreation activeNodeId="topic-1" editor={editor} editorNodeId="topic-1" />
    </LocalizationProvider>
  );
}

function selectRegion() {
  const detail: ImageExcerptRegionSelection = {
    attachmentId: 'source-image',
    image: document.createElement('img'),
    imageRange: { from: 5, to: 5 + imageMarkdown.length },
    left: 120,
    rect: { height: 0.2, width: 0.3, x: 0.1, y: 0.4 },
    top: 80
  };
  window.dispatchEvent(new CustomEvent(IMAGE_EXCERPT_REGION_SELECTED_EVENT, { detail }));
}

beforeEach(() => {
  createExcerpt.mockClear();
  vi.mocked(renderImageExcerptCrop).mockClear();
  useWorkspaceStore.setState({ createPdfImageExcerpt: createExcerpt });
});

it('creates one annotated crop with the exact occurrence locator and local rectangle', async () => {
  renderCreation();
  selectRegion();
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Diagram detail' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(createExcerpt).toHaveBeenCalledOnce());
  expect(createExcerpt).toHaveBeenCalledWith(
    'topic-1',
    { from: 5, originalText: imageMarkdown, to: 5 + imageMarkdown.length },
    [{
      attachmentId: 'source-image',
      regions: [expect.objectContaining({ height: 0.2, width: 0.3, x: 0.1, y: 0.4 })]
    }],
    expect.stringMatching(/^[a-f0-9]{64}$/),
    expect.any(String),
    expect.stringContaining('Diagram detail')
  );
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
});

it('leaves no creation when the annotation is cancelled', async () => {
  renderCreation();
  selectRegion();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

  expect(createExcerpt).not.toHaveBeenCalled();
  expect(renderImageExcerptCrop).not.toHaveBeenCalled();
});

it('does not create when cropping fails', async () => {
  vi.mocked(renderImageExcerptCrop).mockRejectedValueOnce(new Error('crop failed'));
  renderCreation();
  selectRegion();
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Diagram detail' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(renderImageExcerptCrop).toHaveBeenCalledOnce());
  expect(createExcerpt).not.toHaveBeenCalled();
});
